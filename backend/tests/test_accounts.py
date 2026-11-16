"""Accounts: passwords, sessions, ownership, plan limits, usage and Lemon Squeezy billing."""

import hashlib
import hmac
import json
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from tests.conftest import TEST_PASSWORD, requires_ffmpeg, set_plan, signup, upload_file
from twapza.accounts.passwords import hash_password, password_problem, verify_password
from twapza.accounts.plans import effective_plan_id, period_bounds
from twapza.captions.ass import WATERMARK_TEXT, build_ass
from twapza.config import get_settings
from twapza.db.models import AuthSession, Project, UsageEvent, User, utcnow
from twapza.db.session import get_engine


def utc(*args) -> datetime:
    return datetime(*args, tzinfo=UTC)


def user(email: str) -> User:
    with Session(get_engine()) as s:
        return s.exec(select(User).where(User.email == email)).one()


def add_usage(email: str, minutes: float) -> None:
    with Session(get_engine()) as s:
        s.add(UsageEvent(user_id=user(email).id, seconds=minutes * 60))
        s.commit()


# --- pure parts ------------------------------------------------------------------------

def test_password_hashing():
    stored = hash_password("hunter2hunter2")
    assert stored.startswith("scrypt$") and "hunter2" not in stored
    assert verify_password("hunter2hunter2", stored)
    assert not verify_password("hunter2hunter3", stored)
    assert not verify_password("anything", None)
    assert not verify_password("anything", "garbage")
    assert hash_password("same") != hash_password("same")  # salted
    assert password_problem("short") and password_problem("x" * 129)
    assert password_problem("long enough") is None


def test_period_bounds_follow_the_anchor_day():
    anchor = utc(2026, 1, 31, 10, 0)
    assert period_bounds(anchor, utc(2026, 2, 10)) == (utc(2026, 1, 31, 10), utc(2026, 2, 28, 10))
    assert period_bounds(anchor, utc(2026, 3, 5)) == (utc(2026, 2, 28, 10), utc(2026, 3, 31, 10))
    assert period_bounds(anchor, utc(2026, 3, 31, 11)) == (utc(2026, 3, 31, 10), utc(2026, 4, 30, 10))
    # around new year
    jan = utc(2026, 12, 15)
    assert period_bounds(jan, utc(2027, 1, 3)) == (utc(2026, 12, 15), utc(2027, 1, 15))
    assert period_bounds(jan, utc(2026, 12, 20)) == (utc(2026, 12, 15), utc(2027, 1, 15))


def test_effective_plan():
    now = utc(2026, 6, 1)
    assert effective_plan_id("pro", "active", None, now) == "pro"
    assert effective_plan_id("creator", "past_due", None, now) == "creator"  # grace while retrying
    assert effective_plan_id("pro", "manual", None, now) == "pro"
    assert effective_plan_id("pro", "cancelled", utc(2026, 6, 20), now) == "pro"  # paid until then
    assert effective_plan_id("pro", "cancelled", utc(2026, 5, 20), now) == "free"
    assert effective_plan_id("pro", "expired", None, now) == "free"
    assert effective_plan_id("pro", "unpaid", None, now) == "free"
    assert effective_plan_id("pro", None, None, now) == "free"
    assert effective_plan_id("gold", "active", None, now) == "free"


def test_watermark_is_drawn():
    ass = build_ass([], clip_start=0, clip_end=10, settings=None, width=1080, height=1920, watermark=True)
    assert ass and WATERMARK_TEXT in ass and "Style: Watermark" in ass
    assert build_ass([], clip_start=0, clip_end=10, settings=None, width=1080, height=1920) is None


# --- sign up, log in, sessions -----------------------------------------------------------

def test_signup_login_logout(anon_client):
    c = anon_client
    assert c.get("/api/auth/me").status_code == 401
    r = c.post("/api/auth/signup", json={"email": " Ann@Example.com ", "password": TEST_PASSWORD, "lang": "nl"})
    assert r.status_code == 201
    me = r.json()
    assert me["email"] == "ann@example.com" and me["lang"] == "nl"
    assert me["plan"]["id"] == "free" and me["plan"]["watermark"] is True
    assert me["usage"] == {"used_minutes": 0.0, "limit_minutes": 60.0, "resets_at": me["usage"]["resets_at"]}
    cookie = r.headers["set-cookie"]
    assert "twapza_session=" in cookie and "HttpOnly" in cookie and "samesite=lax" in cookie.lower()
    with Session(get_engine()) as s:  # only the hash is stored
        token = c.cookies.get("twapza_session")
        assert s.get(AuthSession, token) is None
        assert s.get(AuthSession, hashlib.sha256(token.encode()).hexdigest()) is not None
    assert c.get("/api/auth/me").json()["email"] == "ann@example.com"

    assert c.post("/api/auth/signup", json={"email": "ann@example.com", "password": TEST_PASSWORD}).status_code == 409
    assert c.post("/api/auth/signup", json={"email": "nope", "password": TEST_PASSWORD}).status_code == 400
    assert c.post("/api/auth/signup", json={"email": "b@example.com", "password": "short"}).status_code == 400

    assert c.post("/api/auth/logout").status_code == 204
    assert c.get("/api/auth/me").status_code == 401
    assert c.post("/api/auth/login", json={"email": "ann@example.com", "password": "wrong password"}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "nobody@example.com", "password": TEST_PASSWORD}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "ANN@example.com", "password": TEST_PASSWORD}).status_code == 200
    assert c.get("/api/auth/me").status_code == 200


def test_expired_session_is_rejected(client):
    with Session(get_engine()) as s:
        for auth in s.exec(select(AuthSession)).all():
            auth.expires_at = utcnow() - timedelta(minutes=1)
            s.add(auth)
        s.commit()
    assert client.get("/api/auth/me").status_code == 401


def test_login_is_rate_limited(anon_client):
    signup(anon_client, "ann@example.com")
    anon_client.post("/api/auth/logout")
    codes = [anon_client.post("/api/auth/login", json={"email": "ann@example.com", "password": "wrong password"}).status_code
             for _ in range(11)]
    assert codes[:10] == [401] * 10 and codes[10] == 429


def test_password_reset(anon_client, monkeypatch):
    sent = []
    monkeypatch.setattr("twapza.api.routes.auth.send_email", lambda to, subject, body: sent.append((to, body)))
    c = anon_client
    signup(c, "ann@example.com")
    other_device = c.cookies.get("twapza_session")
    c.post("/api/auth/logout")

    assert c.post("/api/auth/forgot-password", json={"email": "nobody@example.com"}).status_code == 202
    assert sent == []  # same answer, no email
    assert c.post("/api/auth/forgot-password", json={"email": "Ann@example.com"}).status_code == 202
    (to, body), = sent
    assert to == "ann@example.com"
    token = body.split("reset-password?token=")[1].split()[0]

    assert c.post("/api/auth/reset-password", json={"token": token, "password": "short"}).status_code == 400
    r = c.post("/api/auth/reset-password", json={"token": token, "password": "a brand new password"})
    assert r.status_code == 200 and c.get("/api/auth/me").status_code == 200
    assert c.post("/api/auth/reset-password", json={"token": token, "password": "another new one"}).status_code == 400
    assert c.post("/api/auth/reset-password", json={"token": "made-up", "password": "another new one"}).status_code == 400
    with Session(get_engine()) as s:  # the old login is gone
        assert s.get(AuthSession, hashlib.sha256(other_device.encode()).hexdigest()) is None
    c.post("/api/auth/logout")
    assert c.post("/api/auth/login", json={"email": "ann@example.com", "password": "a brand new password"}).status_code == 200


def test_change_password(client):
    bad = client.post("/api/auth/change-password", json={"current_password": "wrong one!", "new_password": "new password 1"})
    assert bad.status_code == 400
    ok = client.post("/api/auth/change-password", json={"current_password": TEST_PASSWORD, "new_password": "new password 1"})
    assert ok.status_code == 204
    assert client.get("/api/auth/me").status_code == 200  # this device stays logged in
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": "owner@example.com", "password": "new password 1"}).status_code == 200


# --- ownership ----------------------------------------------------------------------------

def test_everything_needs_a_login(anon_client):
    c = anon_client
    assert c.get("/api/projects").status_code == 401
    assert c.post("/api/uploads", json={"filename": "a.mp4", "size_bytes": 10, "rights_confirmed": True}).status_code == 401
    assert c.post("/api/imports", json={"url": "https://youtu.be/dQw4w9WgXcQ", "rights_confirmed": True}).status_code == 401
    assert c.get("/api/jobs/x").status_code == 401
    assert c.get("/api/clips/x/description").status_code == 401
    # public
    assert c.get("/api/health").status_code == 200
    assert c.get("/api/config").status_code == 200


def test_projects_are_private(app):
    with TestClient(app) as ann, TestClient(app) as bob:
        signup(ann, "ann@example.com")
        signup(bob, "bob@example.com")
        r = ann.post("/api/uploads", json={"filename": "a.mp4", "size_bytes": 10, "rights_confirmed": True})
        pid = r.json()["project_id"]
        assert ann.get(f"/api/uploads/{pid}").status_code == 200
        assert bob.get(f"/api/uploads/{pid}").status_code == 404
        assert bob.put(f"/api/uploads/{pid}/chunks/0", content=b"0123456789").status_code == 404
        assert bob.get(f"/api/projects/{pid}").status_code == 404
        assert bob.delete(f"/api/projects/{pid}").status_code == 404
        assert [p["id"] for p in ann.get("/api/projects").json()] == [pid]
        assert bob.get("/api/projects").json() == []


@requires_ffmpeg
def test_clips_and_jobs_are_private(app, sample_video):
    with TestClient(app) as ann, TestClient(app) as bob:
        signup(ann, "ann@example.com", "pro")
        signup(bob, "bob@example.com", "pro")
        done = upload_file(ann, sample_video)
        pid, job_id = done["project"]["id"], done["job"]["id"]
        assert bob.get(f"/api/jobs/{job_id}").status_code == 404
        assert bob.get(f"/api/jobs/{job_id}/events").status_code == 404
        assert bob.get(f"/api/projects/{pid}/proxy").status_code == 404
        assert bob.post(f"/api/projects/{pid}/simple-clips", json={"target_seconds": 15}).status_code == 404
        ann.post(f"/api/projects/{pid}/simple-clips", json={"target_seconds": 15})
        clip_id = ann.get(f"/api/projects/{pid}/clips").json()[0]["id"]
        assert bob.get(f"/api/clips/{clip_id}/thumbnail").status_code == 404
        assert bob.post(f"/api/clips/{clip_id}/export", json={"settings": {}}).status_code == 404
        assert bob.patch(f"/api/clips/{clip_id}", json={"start": 0, "end": 3}).status_code == 404


def test_delete_account(client):
    pid = client.post("/api/uploads", json={"filename": "a.mp4", "size_bytes": 10, "rights_confirmed": True}).json()["project_id"]
    assert client.post("/api/auth/delete-account", json={"password": "wrong password"}).status_code == 400
    assert client.post("/api/auth/delete-account", json={"password": TEST_PASSWORD}).status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    with Session(get_engine()) as s:
        assert s.get(Project, pid) is None
        assert s.exec(select(User)).all() == []
        assert s.exec(select(AuthSession)).all() == []


# --- plans and usage --------------------------------------------------------------------

def test_free_plan_limits_on_editing_features(free_client):
    c = free_client
    for path, body in [
        ("/api/clips/x/overlays", {"overlays": []}),
        ("/api/projects/x/corrections", {"fixes": []}),
    ]:
        assert c.put(path, json=body).status_code == 404  # unknown ids are still 404 first


@requires_ffmpeg
def test_free_plan_gets_watermark_and_no_extras(free_client, sample_video):
    from twapza.api.routes.clips import plan_settings
    from twapza.exports import ExportSettings

    c = free_client
    pid = upload_file(c, sample_video)["project"]["id"]
    c.post(f"/api/projects/{pid}/simple-clips", json={"target_seconds": 15})
    clip_id = c.get(f"/api/projects/{pid}/clips").json()[0]["id"]

    assert c.post(f"/api/clips/{clip_id}/export", json={"settings": {"cut_pauses": True}}).status_code == 402
    assert c.post(f"/api/clips/{clip_id}/export", json={"settings": {"hook_text": True}}).status_code == 402
    assert c.post(f"/api/clips/{clip_id}/description").status_code == 402
    assert c.put(f"/api/clips/{clip_id}/overlays", json={"overlays": []}).status_code == 402
    assert c.put(f"/api/projects/{pid}/corrections", json={"fixes": []}).status_code == 402
    zip_r = c.post(f"/api/projects/{pid}/export-zip", json={"source": "simple", "settings": {}})
    assert zip_r.status_code == 402 and "Pro plan" in zip_r.json()["detail"]
    # a plain download works, with the watermark (whatever the browser asks for)
    r = c.post(f"/api/clips/{clip_id}/export", json={"settings": {"watermark": False}})
    assert r.status_code == 202 and r.json()["status"] == "succeeded"
    free = plan_settings(user("free@example.com"), ExportSettings(watermark=False))
    assert free.watermark is True and free.texts is False
    set_plan("free@example.com", "creator")
    creator = plan_settings(user("free@example.com"), ExportSettings(watermark=True, cut_pauses=True))
    assert creator.watermark is False and creator.texts is True


@requires_ffmpeg
def test_minutes_are_counted_and_enforced(free_client, sample_video):
    c = free_client
    upload_file(c, sample_video)
    me = c.get("/api/auth/me").json()
    assert 0 < me["usage"]["used_minutes"] <= 0.1  # the 3 s sample
    with Session(get_engine()) as s:
        (event,) = s.exec(select(UsageEvent)).all()
        assert 2.5 < event.seconds < 3.5

    add_usage("free@example.com", 59.93)  # ~1 s left: the 3 s video doesn't fit
    done = upload_file(c, sample_video)
    project = c.get(f"/api/projects/{done['project']['id']}").json()
    assert project["status"] == "failed" and "minutes left this month" in project["error"]

    add_usage("free@example.com", 1)
    r = c.post("/api/uploads", json={"filename": "a.mp4", "size_bytes": 10, "rights_confirmed": True})
    assert r.status_code == 402 and "used all 60 video minutes" in r.json()["detail"]
    r = c.post("/api/imports", json={"url": "https://youtu.be/dQw4w9WgXcQ", "rights_confirmed": True})
    assert r.status_code == 402


def test_video_length_limit_per_plan(free_client):
    from twapza.accounts.usage import video_problem

    with Session(get_engine()) as s:
        u = s.exec(select(User)).one()
        assert "up to 60 min" in video_problem(s, u, 61 * 60)
        assert video_problem(s, u, 30 * 60) is None
    set_plan("free@example.com", "pro")
    with Session(get_engine()) as s:
        u = s.exec(select(User)).one()
        assert video_problem(s, u, 170 * 60) is None


def test_priority_queue_name(sync_queue):
    from twapza.queue import with_priority

    assert with_priority(sync_queue, False) is sync_queue
    prio = with_priority(sync_queue, True)
    assert prio.name == "twapza-test-priority" and with_priority(prio, True) is prio


def test_users_cli(client, capsys):
    from twapza.users import main

    assert main(["set-plan", "owner@example.com", "creator"]) == 0
    assert client.get("/api/auth/me").json()["plan"]["id"] == "creator"
    assert main(["list"]) == 0
    assert "owner@example.com\tcreator\tmanual" in capsys.readouterr().out
    assert main(["set-plan", "nobody@example.com", "pro"]) == 1
    assert main(["delete", "owner@example.com"]) == 0
    assert client.get("/api/auth/me").status_code == 401


# --- billing (Lemon Squeezy) ---------------------------------------------------------------

SECRET = "whsec-test"


@pytest.fixture
def billing_env(monkeypatch):
    for name, value in {"API_KEY": "test-key", "STORE_ID": "42", "WEBHOOK_SECRET": SECRET,
                        "VARIANT_CREATOR_MONTHLY": "101", "VARIANT_CREATOR_YEARLY": "102",
                        "VARIANT_PRO_MONTHLY": "201", "VARIANT_PRO_YEARLY": "202"}.items():
        monkeypatch.setenv(f"TWAPZA_LEMONSQUEEZY_{name}", value)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class FakeBilling:
    def __init__(self):
        self.checkouts, self.changes = [], []

    def create_checkout(self, **kwargs):
        self.checkouts.append(kwargs)
        return "https://twapza.lemonsqueezy.com/checkout/abc"

    def change_variant(self, subscription_id, variant_id):
        self.changes.append((subscription_id, variant_id))
        return {"id": subscription_id, "attributes": subscription(variant_id, updated="2026-06-02T00:00:00Z")}

    def get_subscription(self, subscription_id):
        return {"attributes": {"urls": {"customer_portal": "https://portal.example/abc"}}}

    def cancel(self, subscription_id):
        pass


@pytest.fixture
def fake_billing(app, billing_env):
    from twapza.api.routes.billing import billing_client

    fake = FakeBilling()
    app.dependency_overrides[billing_client] = lambda: fake
    return fake


def subscription(variant, status="active", updated="2026-06-01T00:00:00Z", **extra) -> dict:
    return {"variant_id": int(variant), "status": status, "customer_id": 7, "created_at": "2026-05-20T09:00:00Z",
            "updated_at": updated, "renews_at": "2026-07-20T09:00:00Z", "ends_at": None} | extra


def send_webhook(c, event: str, user_id: str | None, attrs: dict, sub_id="sub_1", secret=SECRET):
    body = json.dumps({"meta": {"event_name": event, "custom_data": {"user_id": user_id} if user_id else None},
                       "data": {"type": "subscriptions", "id": sub_id, "attributes": attrs}}).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return c.post("/api/billing/webhook", content=body, headers={"X-Signature": sig, "Content-Type": "application/json"})


def test_billing_not_configured(free_client):
    r = free_client.post("/api/billing/checkout", json={"plan": "creator", "period": "monthly"})
    assert r.status_code == 503
    assert free_client.get("/api/config").json()["billing_enabled"] is False


def test_checkout(free_client, fake_billing):
    r = free_client.post("/api/billing/checkout", json={"plan": "pro", "period": "yearly"})
    assert r.status_code == 200 and r.json()["url"].startswith("https://")
    (call,) = fake_billing.checkouts
    assert call["variant_id"] == "202" and call["email"] == "free@example.com"
    assert call["user_id"] == user("free@example.com").id
    assert call["redirect_url"].endswith("/account?upgraded=1")
    assert free_client.get("/api/config").json()["billing_plans"] == [
        "creator_monthly", "creator_yearly", "pro_monthly", "pro_yearly"]


def test_webhook_lifecycle(free_client, fake_billing):
    c = free_client
    uid = user("free@example.com").id
    assert send_webhook(c, "subscription_created", uid, subscription(101), secret="wrong").status_code == 401
    assert c.get("/api/auth/me").json()["plan"]["id"] == "free"

    assert send_webhook(c, "subscription_created", uid, subscription(101)).status_code == 200
    me = c.get("/api/auth/me").json()
    assert me["plan"]["id"] == "creator" and me["usage"]["limit_minutes"] == 300
    assert me["subscription"]["period"] == "monthly" and me["subscription"]["status"] == "active"
    assert me["usage"]["resets_at"].startswith("2026-") and "-20T09:00" in me["usage"]["resets_at"]

    # an older event arriving late changes nothing
    send_webhook(c, "subscription_updated", uid, subscription(201, updated="2026-05-30T00:00:00Z"))
    assert c.get("/api/auth/me").json()["plan"]["id"] == "creator"
    # later events are found by subscription id even without custom data
    send_webhook(c, "subscription_updated", None, subscription(202, updated="2026-06-03T00:00:00Z"))
    assert c.get("/api/auth/me").json()["plan"]["id"] == "pro"

    # cancelled: keeps Pro until the paid period ends
    future = (utcnow() + timedelta(days=10)).isoformat()
    send_webhook(c, "subscription_cancelled", uid,
                 subscription(202, status="cancelled", updated="2026-06-04T00:00:00Z", ends_at=future))
    me = c.get("/api/auth/me").json()
    assert me["plan"]["id"] == "pro" and me["subscription"]["status"] == "cancelled"
    send_webhook(c, "subscription_expired", uid,
                 subscription(202, status="expired", updated="2026-06-05T00:00:00Z", ends_at="2026-06-05T00:00:00Z"))
    assert c.get("/api/auth/me").json()["plan"]["id"] == "free"

    # unknown variants and other events are ignored
    assert send_webhook(c, "subscription_updated", uid, subscription(999, updated="2026-06-06T00:00:00Z")).status_code == 200
    assert c.get("/api/auth/me").json()["subscription"]["status"] == "expired"


def test_change_plan_and_portal(free_client, fake_billing):
    c = free_client
    assert c.post("/api/billing/change-plan", json={"plan": "pro", "period": "monthly"}).status_code == 409
    send_webhook(c, "subscription_created", user("free@example.com").id, subscription(101))
    assert c.post("/api/billing/checkout", json={"plan": "pro", "period": "monthly"}).status_code == 409
    r = c.post("/api/billing/change-plan", json={"plan": "pro", "period": "monthly"})
    assert r.status_code == 200 and r.json()["plan"]["id"] == "pro"
    assert fake_billing.changes == [("sub_1", "201")]
    assert c.get("/api/billing/portal").json()["url"] == "https://portal.example/abc"


def test_signature_check():
    from twapza.accounts.billing import verify_signature

    body = b'{"a":1}'
    sig = hmac.new(b"s3cret", body, hashlib.sha256).hexdigest()
    assert verify_signature(body, sig, "s3cret")
    assert not verify_signature(body + b" ", sig, "s3cret")
    assert not verify_signature(body, sig, "")
    assert not verify_signature(body, None, "s3cret")


def test_lemonsqueezy_client_request_shape():
    import httpx

    from twapza.accounts.billing import LemonSqueezy

    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(201, json={"data": {"attributes": {"url": "https://x.lemonsqueezy.com/checkout/1"}}})

    ls = LemonSqueezy("key-1", "42", transport=httpx.MockTransport(handler))
    url = ls.create_checkout(variant_id="101", email="a@example.com", user_id="u1", redirect_url="http://x/account")
    assert url == "https://x.lemonsqueezy.com/checkout/1"
    (req,) = seen
    assert req.url == "https://api.lemonsqueezy.com/v1/checkouts"
    assert req.headers["authorization"] == "Bearer key-1"
    assert req.headers["content-type"] == "application/vnd.api+json"
    data = json.loads(req.content)["data"]
    assert data["attributes"]["checkout_data"] == {"email": "a@example.com", "custom": {"user_id": "u1"}}
    assert data["relationships"]["store"]["data"] == {"type": "stores", "id": "42"}
    assert data["relationships"]["variant"]["data"] == {"type": "variants", "id": "101"}


def test_client_ip_counts_only_our_proxies(monkeypatch):
    from starlette.requests import Request

    from twapza.accounts.ratelimit import client_ip

    def req(xff: str | None) -> Request:
        headers = [(b"x-forwarded-for", xff.encode())] if xff else []
        return Request({"type": "http", "headers": headers, "client": ("10.0.0.9", 1)})

    # nginx only: the last entry is what nginx saw; earlier ones were sent by the browser
    assert client_ip(req("6.6.6.6, 1.2.3.4")) == "1.2.3.4"
    assert client_ip(req(None)) == "10.0.0.9"
    monkeypatch.setenv("TWAPZA_TRUSTED_PROXY_HOPS", "2")  # Caddy + nginx
    get_settings.cache_clear()
    assert client_ip(req("6.6.6.6, 1.2.3.4, 172.18.0.5")) == "1.2.3.4"
    assert client_ip(req("172.18.0.5")) == "172.18.0.5"
    get_settings.cache_clear()

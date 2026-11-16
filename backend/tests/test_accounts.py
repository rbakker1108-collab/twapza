"""Accounts: passwords, sessions, ownership, plan limits, usage and Lemon Squeezy billing."""

import hashlib
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
    assert effective_plan_id("pro", "trialing", None, now) == "pro"
    assert effective_plan_id("creator", "past_due", None, now) == "creator"  # grace while retrying
    assert effective_plan_id("pro", "manual", None, now) == "pro"
    # cancelled at period end: Stripe keeps it "active" until then
    assert effective_plan_id("pro", "active", utc(2026, 6, 20), now) == "pro"
    assert effective_plan_id("pro", "active", utc(2026, 5, 20), now) == "free"  # final webhook late
    assert effective_plan_id("pro", "canceled", None, now) == "free"
    assert effective_plan_id("pro", "incomplete", None, now) == "free"
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


# --- billing (Stripe) ----------------------------------------------------------------------

SECRET = "whsec_test"
NOW = 1_780_000_000  # a fixed "now" for subscription times


@pytest.fixture
def billing_env(monkeypatch):
    for name, value in {"SECRET_KEY": "sk_test_123", "WEBHOOK_SECRET": SECRET,
                        "PRICE_CREATOR_MONTHLY": "price_cm", "PRICE_CREATOR_YEARLY": "price_cy",
                        "PRICE_PRO_MONTHLY": "price_pm", "PRICE_PRO_YEARLY": "price_py"}.items():
        monkeypatch.setenv(f"TWAPZA_STRIPE_{name}", value)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def subscription(price="price_cm", status="active", sub_id="sub_1", **extra) -> dict:
    return {"id": sub_id, "object": "subscription", "status": status, "customer": "cus_1",
            "metadata": {}, "cancel_at_period_end": False, "cancel_at": None,
            "billing_cycle_anchor": NOW - 86400, "start_date": NOW - 86400,
            "items": {"data": [{"id": "si_1", "price": {"id": price},
                                "current_period_end": NOW + 29 * 86400}]}} | extra


class FakeStripe:
    """Stands in for accounts.billing.Stripe; ``subs`` is what Stripe would return."""

    def __init__(self):
        self.checkouts, self.changes, self.portals, self.cancelled = [], [], [], []
        self.subs: dict[str, dict] = {}

    def create_checkout(self, **kwargs):
        self.checkouts.append(kwargs)
        return "https://checkout.stripe.com/c/pay/cs_test_1"

    def get_subscription(self, subscription_id):
        return self.subs[subscription_id]

    def change_plan_url(self, **kwargs):
        self.changes.append(kwargs)
        return "https://billing.stripe.com/p/session/confirm"

    def portal(self, **kwargs):
        self.portals.append(kwargs)
        return "https://billing.stripe.com/p/session/abc"

    def cancel(self, subscription_id):
        self.cancelled.append(subscription_id)


@pytest.fixture
def fake_billing(app, billing_env):
    from twapza.api.routes.billing import billing_client

    fake = FakeStripe()
    app.dependency_overrides[billing_client] = lambda: fake
    return fake


def send_webhook(c, event_type: str, obj: dict, secret=SECRET, timestamp: int | None = None):
    from twapza.accounts.billing import sign

    body = json.dumps({"id": "evt_1", "object": "event", "type": event_type, "data": {"object": obj}}).encode()
    return c.post("/api/billing/webhook", content=body,
                  headers={"Stripe-Signature": sign(body, secret, timestamp), "Content-Type": "application/json"})


def checkout_completed(user_id: str, sub_id="sub_1") -> dict:
    return {"id": "cs_1", "object": "checkout.session", "mode": "subscription", "subscription": sub_id,
            "customer": "cus_1", "client_reference_id": user_id, "metadata": {"user_id": user_id}}


def test_billing_not_configured(free_client):
    r = free_client.post("/api/billing/checkout", json={"plan": "creator", "period": "monthly"})
    assert r.status_code == 503
    assert free_client.get("/api/config").json()["billing_enabled"] is False


def test_checkout(free_client, fake_billing):
    r = free_client.post("/api/billing/checkout", json={"plan": "pro", "period": "yearly"})
    assert r.status_code == 200 and r.json()["url"].startswith("https://checkout.stripe.com/")
    (call,) = fake_billing.checkouts
    assert call["price_id"] == "price_py" and call["user"].email == "free@example.com"
    assert call["success_url"].endswith("/account?upgraded=1") and call["cancel_url"].endswith("/account#plans")
    assert free_client.get("/api/config").json()["billing_plans"] == [
        "creator_monthly", "creator_yearly", "pro_monthly", "pro_yearly"]


def test_webhook_lifecycle(free_client, fake_billing):
    c = free_client
    uid = user("free@example.com").id
    fake_billing.subs["sub_1"] = subscription("price_cm")
    assert send_webhook(c, "checkout.session.completed", checkout_completed(uid), secret="whsec_wrong").status_code == 400
    assert c.get("/api/auth/me").json()["plan"]["id"] == "free"

    assert send_webhook(c, "checkout.session.completed", checkout_completed(uid)).status_code == 200
    me = c.get("/api/auth/me").json()
    assert me["plan"]["id"] == "creator" and me["usage"]["limit_minutes"] == 300
    assert me["subscription"]["period"] == "monthly" and me["subscription"]["status"] == "active"
    assert me["subscription"]["renews_at"] and me["subscription"]["ends_at"] is None

    # Events carry stale data and may arrive in any order: we always read the subscription fresh.
    fake_billing.subs["sub_1"] = subscription("price_py")
    send_webhook(c, "customer.subscription.updated", subscription("price_cm"))  # old payload
    me = c.get("/api/auth/me").json()
    assert me["plan"]["id"] == "pro" and me["subscription"]["period"] == "yearly"

    # Cancelled at period end: still Pro, with an end date
    ends = NOW + 20 * 86400
    fake_billing.subs["sub_1"] = subscription("price_py", cancel_at_period_end=True, cancel_at=ends)
    send_webhook(c, "customer.subscription.updated", fake_billing.subs["sub_1"])
    me = c.get("/api/auth/me").json()
    assert me["subscription"]["ends_at"] and me["subscription"]["renews_at"] is None
    # (NOW is in 2026, so that end date has passed by the time these tests run in later years;
    # the plan check below only uses the status)
    fake_billing.subs["sub_1"] = subscription("price_py", status="canceled")
    send_webhook(c, "customer.subscription.deleted", fake_billing.subs["sub_1"])
    me = c.get("/api/auth/me").json()
    assert me["plan"]["id"] == "free" and me["subscription"]["status"] == "canceled"

    # payment trouble keeps the plan while Stripe retries
    fake_billing.subs["sub_2"] = subscription("price_cm", sub_id="sub_2", status="past_due")
    send_webhook(c, "customer.subscription.updated", fake_billing.subs["sub_2"] | {"metadata": {"user_id": uid}})
    assert c.get("/api/auth/me").json()["plan"]["id"] == "creator"


def test_webhook_ignores_other_events_and_unknown_prices(free_client, fake_billing):
    c = free_client
    uid = user("free@example.com").id
    assert send_webhook(c, "invoice.paid", {"id": "in_1"}).json()["ignored"] == "invoice.paid"
    assert send_webhook(c, "checkout.session.completed", {"mode": "payment", "client_reference_id": uid}).status_code == 200
    fake_billing.subs["sub_9"] = subscription("price_someone_else", sub_id="sub_9")
    send_webhook(c, "checkout.session.completed", checkout_completed(uid, "sub_9"))
    assert c.get("/api/auth/me").json()["plan"]["id"] == "free"
    # an old, replayed event is refused
    old = send_webhook(c, "checkout.session.completed", checkout_completed(uid), timestamp=1_600_000_000)
    assert old.status_code == 400


def test_change_plan_and_portal(free_client, fake_billing):
    c = free_client
    assert c.post("/api/billing/change-plan", json={"plan": "pro", "period": "monthly"}).status_code == 409
    assert c.get("/api/billing/portal").status_code == 404
    fake_billing.subs["sub_1"] = subscription("price_cm")
    send_webhook(c, "checkout.session.completed", checkout_completed(user("free@example.com").id))
    assert c.post("/api/billing/checkout", json={"plan": "pro", "period": "monthly"}).status_code == 409
    r = c.post("/api/billing/change-plan", json={"plan": "pro", "period": "monthly"})
    assert r.status_code == 200 and r.json()["url"].endswith("/confirm")
    (change,) = fake_billing.changes
    assert change == {"subscription_id": "sub_1", "customer_id": "cus_1", "price_id": "price_pm",
                      "return_url": change["return_url"]}
    assert c.get("/api/billing/portal").json()["url"] == "https://billing.stripe.com/p/session/abc"
    assert fake_billing.portals[0]["customer_id"] == "cus_1"


def test_delete_account_cancels_subscription(free_client, fake_billing, monkeypatch):
    c = free_client
    fake_billing.subs["sub_1"] = subscription("price_cm")
    send_webhook(c, "checkout.session.completed", checkout_completed(user("free@example.com").id))
    monkeypatch.setattr("twapza.accounts.users.get_billing", lambda settings: fake_billing)
    assert c.post("/api/auth/delete-account", json={"password": TEST_PASSWORD}).status_code == 204
    assert fake_billing.cancelled == ["sub_1"]


def test_signature_check():
    from twapza.accounts.billing import sign, verify_signature

    body = b'{"a":1}'
    header = sign(body, "whsec_x", timestamp=1000)
    assert verify_signature(body, header, "whsec_x", now=1100)
    assert not verify_signature(body, header, "whsec_x", now=1000 + 301)  # too old
    assert not verify_signature(body + b" ", header, "whsec_x", now=1100)
    assert not verify_signature(body, header, "whsec_other", now=1100)
    assert not verify_signature(body, header, "", now=1100)
    assert not verify_signature(body, None, "whsec_x", now=1100)
    assert not verify_signature(body, "t=abc,v1=00", "whsec_x", now=1100)
    # Stripe may send several v1 signatures while a secret is being rolled
    assert verify_signature(body, f"{header},v1=deadbeef", "whsec_x", now=1100)


def test_stripe_form_encoding():
    from twapza.accounts.billing import encode

    assert encode({"mode": "subscription", "line_items": [{"price": "p", "quantity": 1}],
                   "managed_payments": {"enabled": True}, "skip": None, "list": ["a", "b"]}) == [
        ("mode", "subscription"), ("line_items[0][price]", "p"), ("line_items[0][quantity]", "1"),
        ("managed_payments[enabled]", "true"), ("list[0]", "a"), ("list[1]", "b")]


def test_stripe_client_request_shape():
    import httpx
    from urllib.parse import parse_qsl

    from twapza.accounts.billing import Stripe

    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path.endswith("/checkout/sessions"):
            return httpx.Response(200, json={"url": "https://checkout.stripe.com/c/pay/cs_1"})
        if request.url.path.endswith("/subscriptions/sub_1"):
            return httpx.Response(200, json=subscription())
        return httpx.Response(200, json={"url": "https://billing.stripe.com/p/session/x"})

    stripe = Stripe("sk_test_1", api_version="2026-10-28.endive", portal_configuration="bpc_1",
                    transport=httpx.MockTransport(handler))
    u = User(id="u1", email="a@example.com", password_hash="x")
    url = stripe.create_checkout(price_id="price_cm", user=u, success_url="https://x/account?upgraded=1",
                                 cancel_url="https://x/account#plans")
    assert url == "https://checkout.stripe.com/c/pay/cs_1"
    req = seen[0]
    assert req.url == "https://api.stripe.com/v1/checkout/sessions" and req.method == "POST"
    assert req.headers["authorization"] == "Bearer sk_test_1"
    assert req.headers["stripe-version"] == "2026-10-28.endive"
    form = dict(parse_qsl(req.content.decode()))
    assert form["mode"] == "subscription" and form["line_items[0][price]"] == "price_cm"
    assert form["managed_payments[enabled]"] == "true"
    assert form["client_reference_id"] == "u1" and form["subscription_data[metadata][user_id]"] == "u1"
    assert form["customer_email"] == "a@example.com" and "customer" not in form

    stripe.change_plan_url(subscription_id="sub_1", customer_id="cus_1", price_id="price_py",
                           return_url="https://x/account")
    portal = dict(parse_qsl(seen[-1].content.decode()))
    assert seen[-1].url.path == "/v1/billing_portal/sessions"
    assert portal["flow_data[type]"] == "subscription_update_confirm"
    assert portal["flow_data[subscription_update_confirm][items][0][id]"] == "si_1"
    assert portal["flow_data[subscription_update_confirm][items][0][price]"] == "price_py"
    assert portal["configuration"] == "bpc_1" and portal["customer"] == "cus_1"


def test_stripe_setup_creates_products_prices_and_portal():
    import httpx
    from urllib.parse import parse_qsl

    from twapza.accounts.billing import Stripe
    from twapza.stripe_setup import create_all

    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append((request.url.path, dict(parse_qsl(request.content.decode()))))
        return httpx.Response(200, json={"id": f"obj_{len(calls)}"})

    env = create_all(Stripe("sk_test_1", api_version="v", transport=httpx.MockTransport(handler)), "https://www.twapza.io")
    assert set(env) == {"TWAPZA_STRIPE_PRICE_CREATOR_MONTHLY", "TWAPZA_STRIPE_PRICE_CREATOR_YEARLY",
                        "TWAPZA_STRIPE_PRICE_PRO_MONTHLY", "TWAPZA_STRIPE_PRICE_PRO_YEARLY",
                        "TWAPZA_STRIPE_PORTAL_CONFIGURATION"}
    prices = [form for path, form in calls if path == "/v1/prices"]
    assert [(p["unit_amount"], p["recurring[interval]"]) for p in prices] == [
        ("1500", "month"), ("14400", "year"), ("2900", "month"), ("27600", "year")]
    portal = calls[-1][1]
    assert calls[-1][0] == "/v1/billing_portal/configurations"
    assert portal["features[subscription_update][enabled]"] == "true"
    assert portal["default_return_url"] == "https://www.twapza.io/account"


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


def test_accounts_survive_the_move_to_stripe(isolated_env):
    """A v8 database (Lemon Squeezy era) keeps its accounts; variant_id becomes price_id."""
    from sqlalchemy import text

    from twapza.db.session import SCHEMA_VERSION, init_db

    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text('ALTER TABLE "user" RENAME COLUMN price_id TO variant_id'))
        conn.execute(text("INSERT INTO \"user\" (id, email, password_hash, lang, created_at, plan, variant_id) "
                          "VALUES ('u1', 'a@example.com', 'x', 'en', '2026-01-01 00:00:00', 'pro', '123')"))
        conn.execute(text("PRAGMA user_version = 8"))
    init_db()
    with Session(engine) as s:
        u = s.get(User, "u1")
        assert u is not None and u.price_id == "123" and u.plan == "pro"
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA user_version")).scalar() == SCHEMA_VERSION

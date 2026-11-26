"""Before-launch protection: email verification, daily AI limits, health check, error reporting."""

from datetime import timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from tests.conftest import TEST_PASSWORD, set_plan, signup
from twapza.config import get_settings
from twapza.db.models import EmailVerification, User, utcnow
from twapza.db.session import get_engine


def link_token(sent: list) -> str:
    (to, subject, body), *_ = sent[-1:]
    return body.split("verify-email?token=")[1].split()[0]


def test_new_accounts_confirm_their_email_before_adding_videos(app, monkeypatch):
    sent = []
    monkeypatch.setattr("twapza.api.routes.auth.send_email", lambda to, subject, body: sent.append((to, subject, body)))
    with TestClient(app) as c:
        r = c.post("/api/auth/signup", json={"email": "new@example.com", "password": TEST_PASSWORD})
        assert r.status_code == 201 and r.json()["email_verified"] is False
        assert sent[0][0] == "new@example.com" and "Confirm your email" in sent[0][1]

        upload = c.post("/api/uploads", json={"filename": "a.mp4", "size_bytes": 10, "rights_confirmed": True})
        assert upload.status_code == 403 and "Confirm your email" in upload.json()["detail"]
        imp = c.post("/api/imports", json={"url": "https://youtu.be/dQw4w9WgXcQ", "rights_confirmed": True})
        assert imp.status_code == 403

        assert c.post("/api/auth/resend-verification").status_code == 202
        assert len(sent) == 2
        bad = c.post("/api/auth/verify-email", json={"token": "made-up"})
        assert bad.status_code == 400
        ok = c.post("/api/auth/verify-email", json={"token": link_token(sent)})
        assert ok.status_code == 200 and ok.json()["email_verified"] is True
        # all links are used up once the address is confirmed
        assert c.post("/api/auth/verify-email", json={"token": link_token(sent[:1])}).status_code == 400
        assert c.post("/api/uploads", json={"filename": "a.mp4", "size_bytes": 10, "rights_confirmed": True}).status_code == 201
        assert c.post("/api/auth/resend-verification").json().get("already") is True


def test_confirmation_link_logs_in_and_expires(app, monkeypatch):
    sent = []
    monkeypatch.setattr("twapza.api.routes.auth.send_email", lambda to, subject, body: sent.append((to, subject, body)))
    with TestClient(app) as phone, TestClient(app) as laptop:
        phone.post("/api/auth/signup", json={"email": "new@example.com", "password": TEST_PASSWORD})
        token = link_token(sent)
        # opening the link on another device logs that device in
        assert laptop.get("/api/auth/me").status_code == 401
        assert laptop.post("/api/auth/verify-email", json={"token": token}).status_code == 200
        assert laptop.get("/api/auth/me").json()["email_verified"] is True

        phone.post("/api/auth/signup", json={"email": "late@example.com", "password": TEST_PASSWORD})
        late = link_token(sent)
        with Session(get_engine()) as s:
            for v in s.exec(select(EmailVerification)).all():
                v.expires_at = utcnow() - timedelta(minutes=1)
                s.add(v)
            s.commit()
        assert phone.post("/api/auth/verify-email", json={"token": late}).status_code == 400


def test_resending_is_rate_limited(app, monkeypatch):
    monkeypatch.setattr("twapza.api.routes.auth.send_email", lambda *a: None)
    with TestClient(app) as c:
        signup(c, "new@example.com", verified=False)
        codes = [c.post("/api/auth/resend-verification").status_code for _ in range(4)]
        assert codes == [202, 202, 202, 429]


def test_password_reset_also_confirms_the_address(app, monkeypatch):
    sent = []
    monkeypatch.setattr("twapza.api.routes.auth.send_email", lambda to, subject, body: sent.append(body))
    with TestClient(app) as c:
        signup(c, "new@example.com", verified=False)
        c.post("/api/auth/forgot-password", json={"email": "new@example.com"})
        token = sent[-1].split("reset-password?token=")[1].split()[0]
        r = c.post("/api/auth/reset-password", json={"token": token, "password": "a new password!"})
        assert r.json()["email_verified"] is True


def test_verification_can_be_switched_off(app, monkeypatch):
    monkeypatch.setenv("TWAPZA_EMAIL_VERIFICATION", "false")
    get_settings.cache_clear()
    with TestClient(app) as c:
        signup(c, "new@example.com", verified=False)
        assert c.get("/api/auth/me").json()["email_verified"] is True
        assert c.post("/api/uploads", json={"filename": "a.mp4", "size_bytes": 10, "rights_confirmed": True}).status_code == 201
    get_settings.cache_clear()


def test_existing_accounts_count_as_confirmed_after_the_upgrade(isolated_env):
    """A v9 database: accounts made before verification existed are confirmed by the migration."""
    from sqlalchemy import text

    from twapza.db.session import SCHEMA_VERSION, init_db

    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(text('ALTER TABLE "user" DROP COLUMN email_verified_at'))
        conn.execute(text("DROP TABLE emailverification"))
        conn.execute(text("INSERT INTO \"user\" (id, email, password_hash, lang, created_at, plan) "
                          "VALUES ('u1', 'old@example.com', 'x', 'en', '2026-01-01 00:00:00', 'free')"))
        conn.execute(text("PRAGMA user_version = 9"))
    init_db()
    with Session(engine) as s:
        assert s.get(User, "u1").email_verified_at is not None
        assert s.exec(select(EmailVerification)).all() == []
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA user_version")).scalar() == SCHEMA_VERSION


def test_daily_ai_limit(free_client, monkeypatch):
    from twapza.accounts import ratelimit

    for _ in range(10):
        ratelimit.ai_daily("u1", 10)
    try:
        ratelimit.ai_daily("u1", 10)
        raise AssertionError("expected the 11th request to be refused")
    except Exception as exc:  # noqa: BLE001
        assert getattr(exc, "status_code", None) == 429 and "today's limit of 10" in exc.detail
    ratelimit.ai_daily("someone-else", 10)  # per account
    assert free_client.get("/api/auth/me").json()["plan"]["ai_per_day"] == 10
    set_plan("free@example.com", "pro")
    assert free_client.get("/api/auth/me").json()["plan"]["ai_per_day"] == 200


def test_ai_highlights_count_towards_the_daily_limit(free_client, monkeypatch):
    from twapza.db.models import Project, ProjectStatus

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    get_settings.cache_clear()
    me = free_client.get("/api/auth/me").json()["id"]
    now = utcnow()
    with Session(get_engine()) as s:
        p = Project(user_id=me, filename="a.mp4", ext="mp4", size_bytes=1, chunk_size=1, total_chunks=1,
                    status=ProjectStatus.READY, rights_confirmed_at=now, expires_at=now + timedelta(hours=1), duration=60)
        s.add(p)
        s.commit()
        pid = p.id
    calls = []
    monkeypatch.setattr("twapza.accounts.ratelimit.ai_daily", lambda user_id, limit: calls.append((user_id, limit)))
    free_client.post(f"/api/projects/{pid}/ai-clips", json={})
    assert calls == [(me, 10)]
    get_settings.cache_clear()


def test_health_checks_database_and_queue(anon_client, monkeypatch):
    r = anon_client.get("/api/health")
    assert r.status_code == 200 and r.json() == {"status": "ok", "database": "ok", "queue": "ok"}

    class Down:
        def ping(self):
            raise ConnectionError("redis is down")

    monkeypatch.setattr("twapza.queue.get_redis", lambda: Down())
    r = anon_client.get("/api/health")
    assert r.status_code == 503 and r.json()["queue"] == "down" and r.json()["status"] == "degraded"


def test_error_reporting_is_off_without_a_dsn_and_never_sends_personal_data(monkeypatch):
    import sentry_sdk

    from twapza.monitoring import init_sentry

    assert init_sentry("api") is False
    seen = {}
    monkeypatch.setattr(sentry_sdk, "init", lambda **kw: seen.update(kw))
    monkeypatch.setattr(sentry_sdk, "set_tag", lambda *a: None)
    monkeypatch.setenv("TWAPZA_SENTRY_DSN", "https://key@o1.ingest.de.sentry.io/1")
    get_settings.cache_clear()
    assert init_sentry("worker") is True
    assert seen["send_default_pii"] is False and seen["traces_sample_rate"] == 0.0
    assert seen["server_name"] == "twapza-worker"
    get_settings.cache_clear()


def test_a_broken_error_reporting_setup_never_stops_startup(monkeypatch):
    import sentry_sdk

    from twapza.monitoring import init_sentry

    def refuse(**kw):
        raise TypeError("Unknown option 'send_default_pii'")  # what sentry-sdk 3.0 did

    monkeypatch.setattr(sentry_sdk, "init", refuse)
    monkeypatch.setenv("TWAPZA_SENTRY_DSN", "https://key@o1.ingest.de.sentry.io/1")
    get_settings.cache_clear()
    assert init_sentry("api") is False
    get_settings.cache_clear()


def test_expected_job_failures_are_warnings_not_errors(caplog):
    import logging

    from twapza.media.ffmpeg import MediaError
    from twapza.queue import run_tracked
    from twapza.db.models import Job, JobType, Project

    now = utcnow()
    with Session(get_engine()) as s:
        p = Project(filename="a.mp4", ext="mp4", size_bytes=1, chunk_size=1, total_chunks=1,
                    rights_confirmed_at=now, expires_at=now + timedelta(hours=1))
        s.add(p)
        s.commit()
        jobs = [Job(project_id=p.id, type=JobType.EXPORT), Job(project_id=p.id, type=JobType.EXPORT)]
        s.add_all(jobs)
        s.commit()
        ids = [j.id for j in jobs]

    def too_long(_):
        raise MediaError("Video is 200 min long; the limit is 180 min.")

    def bug(_):
        raise KeyError("oops")

    with caplog.at_level(logging.WARNING, logger="twapza.queue"):
        run_tracked(ids[0], too_long)
        run_tracked(ids[1], bug)
    levels = [(r.levelname, r.getMessage()) for r in caplog.records if r.name == "twapza.queue"]
    assert ("WARNING", f"job {ids[0]} failed: Video is 200 min long; the limit is 180 min.") in levels
    assert ("ERROR", f"job {ids[1]} failed") in levels

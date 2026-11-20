from sqlalchemy import text
from sqlmodel import Session, select

from twapza.db.models import WaitlistEntry


def test_join_waitlist(client):
    r = client.post("/api/waitlist", json={"email": "  Roel@Example.COM ", "lang": "nl"})
    assert r.status_code == 201 and r.json() == {"ok": True}
    assert client.post("/api/waitlist", json={"email": "roel@example.com"}).status_code == 201  # twice is fine
    from twapza.db.session import get_engine
    with Session(get_engine()) as s:
        rows = s.exec(select(WaitlistEntry)).all()
    assert [(e.email, e.lang) for e in rows] == [("roel@example.com", "nl")]

    for bad in ["nope", "a@b", "two@@x.com", "spaces in@x.com"]:
        assert client.post("/api/waitlist", json={"email": bad}).status_code in (400, 422), bad
    assert client.post("/api/waitlist", json={"email": "x@y.com", "lang": "xx"}).status_code == 422
    assert client.get("/api/waitlist").status_code == 405  # the list is never served


def test_waitlist_survives_a_schema_reset(client, capsys):
    from twapza.db.session import get_engine, init_db
    from twapza.waitlist import main

    client.post("/api/waitlist", json={"email": "keep@me.com"})
    with get_engine().begin() as conn:
        conn.execute(text("PRAGMA user_version = 1"))  # an old, unmigratable database
    init_db()
    assert main([]) == 0
    assert "keep@me.com,en," in capsys.readouterr().out
    assert main(["--remove", "KEEP@me.com"]) == 0
    assert main([]) == 0
    assert "keep@me.com" not in capsys.readouterr().out.split("removed")[-1]

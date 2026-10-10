import io
import zipfile

import pytest

from tests.conftest import make_test_video, requires_ffmpeg, upload_file
from twapza.db.session import SCHEMA_VERSION

pytestmark = requires_ffmpeg


@pytest.fixture
def ready_project(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TWAPZA_EXPORT_PRESET", "ultrafast")
    from twapza.config import get_settings
    get_settings.cache_clear()
    video = make_test_video(tmp_path / "My Talk.mp4", seconds=40)
    result = upload_file(client, video)
    pid = result["project"]["id"]
    project = client.get(f"/api/projects/{pid}").json()
    assert project["status"] == "ready"
    return project


def test_ingest_queues_transcription(client, ready_project, fake_transcriber):
    jobs = {j["type"]: j for j in ready_project["jobs"]}
    assert jobs["ingest"]["status"] == "succeeded"
    assert jobs["transcribe"]["status"] == "succeeded"
    assert fake_transcriber.calls == 1
    transcript = client.get(f"/api/projects/{ready_project['id']}/transcript").json()
    assert transcript["language"] == "en"
    assert transcript["segments"][0]["words"][0]["text"] == " w1"


def generate(client, pid, seconds):
    r = client.post(f"/api/projects/{pid}/simple-clips", json={"target_seconds": seconds})
    assert r.status_code == 202, r.text
    job = client.get(f"/api/jobs/{r.json()['id']}").json()
    assert job["status"] == "succeeded", job
    return client.get(f"/api/projects/{pid}/clips?source=simple").json()


def test_simple_clips_end_to_end(client, ready_project, fake_transcriber):
    pid = ready_project["id"]
    clips = generate(client, pid, 15)
    assert fake_transcriber.calls == 1  # cached transcript reused

    assert [c["index"] for c in clips] == [1, 2]
    assert clips[0]["start"] == 0 and clips[-1]["end"] == pytest.approx(40, abs=0.1)
    assert 10 <= clips[0]["duration"] <= 20
    assert clips[0]["text"].startswith("w1 w2")
    assert clips[0]["end"] <= clips[1]["start"]

    thumb = client.get(clips[0]["thumbnail_url"])
    assert thumb.status_code == 200 and thumb.headers["content-type"] == "image/jpeg"

    # Single-clip export → download
    export = client.post(f"/api/clips/{clips[0]['id']}/export", json={}).json()
    assert export["status"] == "succeeded" and export["download_url"]
    download = client.get(export["download_url"])
    assert download.status_code == 200
    assert download.headers["content-type"] == "video/mp4"
    assert "My_Talk_simple01_00m00s-" in download.headers["content-disposition"]
    assert download.content[4:8] == b"ftyp"

    # Exporting again reuses the rendered file (instant, already succeeded)
    again = client.post(f"/api/clips/{clips[0]['id']}/export", json={}).json()
    assert again["id"] != export["id"] and again["status"] == "succeeded"
    assert client.get(again["download_url"]).content == download.content

    # ZIP of all clips
    zjob = client.post(f"/api/projects/{pid}/export-zip", json={}).json()
    assert zjob["status"] == "succeeded", zjob
    z = client.get(zjob["download_url"])
    assert z.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    assert len(names) == 2 and names[0].startswith("My_Talk_simple01_")


def test_exports_upscale_small_videos_to_1080p_unless_disabled(client, ready_project, tmp_path):
    from twapza.media import ffmpeg as media

    clip = generate(client, ready_project["id"], 15)[0]
    sizes = {}
    for upscale in (True, False):
        job = client.post(f"/api/clips/{clip['id']}/export",
                          json={"settings": {"upscale_1080": upscale}}).json()
        assert job["status"] == "succeeded", job
        out = tmp_path / f"export-{upscale}.mp4"
        out.write_bytes(client.get(job["download_url"]).content)
        info = media.probe(out)
        sizes[upscale] = (info.width, info.height)
    assert sizes == {True: (1440, 1080), False: (320, 240)}  # source is 320x240


def test_vertical_export_for_shorts(client, ready_project, tmp_path):
    from twapza.media import ffmpeg as media

    clip = generate(client, ready_project["id"], 15)[0]
    job = client.post(f"/api/clips/{clip['id']}/export",
                      json={"settings": {"aspect": "9:16", "vertical_fit": "blur"}}).json()
    assert job["status"] == "succeeded", job
    r = client.get(job["download_url"])
    assert "_vertical.mp4" in r.headers["content-disposition"]
    out = tmp_path / "v.mp4"
    out.write_bytes(r.content)
    info = media.probe(out)
    assert (info.width, info.height) == (1080, 1920)

    bad = client.post(f"/api/clips/{clip['id']}/export", json={"settings": {"aspect": "4:5"}})
    assert bad.status_code == 422


def test_regenerating_replaces_previous_clips(client, ready_project):
    pid = ready_project["id"]
    first = generate(client, pid, 15)
    second = generate(client, pid, 20)
    assert {c["id"] for c in first}.isdisjoint({c["id"] for c in second})
    assert client.get(first[0]["thumbnail_url"]).status_code == 404
    # Exporting a deleted clip fails cleanly
    assert client.post(f"/api/clips/{first[0]['id']}/export", json={}).status_code == 404


def test_validation(client, ready_project):
    pid = ready_project["id"]
    for bad in (10, 181):
        r = client.post(f"/api/projects/{pid}/simple-clips", json={"target_seconds": bad})
        assert r.status_code == 422
    assert client.post(f"/api/projects/{pid}/export-zip", json={}).status_code == 400
    assert client.post("/api/projects/nope/simple-clips", json={"target_seconds": 60}).status_code == 404


def test_video_without_audio_gets_plain_cuts(client, tmp_path, fake_transcriber):
    video = make_test_video(tmp_path / "silent.mkv", seconds=35, audio=False)
    pid = upload_file(client, video)["project"]["id"]
    clips = generate(client, pid, 15)
    assert fake_transcriber.calls == 0
    assert [(c["start"], c["end"]) for c in clips] == [(0, 15), (15, pytest.approx(35, abs=0.1))]


def test_schema_v2_database_is_migrated_without_losing_data(isolated_env):
    """Upgrading from Stage 2 (schema v2) keeps existing projects and clips."""
    from sqlalchemy import text
    from sqlmodel import Session

    from twapza.db.models import Clip, ClipSource, Project, utcnow
    from twapza.db.session import get_engine, init_db

    engine = get_engine()
    with engine.begin() as conn:  # recreate the v2 clip table (no suggested_* columns)
        conn.execute(text("DROP TABLE clip"))
        conn.execute(text(
            "CREATE TABLE clip (id VARCHAR PRIMARY KEY, project_id VARCHAR, source VARCHAR, "
            "\"index\" INTEGER, start FLOAT, \"end\" FLOAT, text VARCHAR, title VARCHAR, "
            "hook VARCHAR, score FLOAT, reason VARCHAR, created_at DATETIME)"))
    now = utcnow()
    with Session(engine) as s:
        s.add(Project(id="p", filename="a.mp4", ext="mp4", size_bytes=1, chunk_size=1, total_chunks=1,
                      rights_confirmed_at=now, expires_at=now))
        s.commit()
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project DROP COLUMN source_url"))  # added in v4
        conn.execute(text("PRAGMA user_version = 2"))
        conn.execute(text("INSERT INTO clip (id, project_id, source, \"index\", start, \"end\", text) "
                          "VALUES ('c', 'p', 'SIMPLE', 1, 0, 60, 'hi')"))

    init_db()
    with Session(engine) as s:
        clip = s.get(Clip, "c")
        assert clip is not None and clip.source == ClipSource.SIMPLE and clip.suggested_start is None
        project = s.get(Project, "p")
        assert project is not None and project.source_url is None
    with engine.connect() as conn:
        assert conn.execute(text("PRAGMA user_version")).scalar() == SCHEMA_VERSION


def test_schema_version_mismatch_resets_temporary_data(isolated_env):
    from sqlalchemy import text

    from twapza.db.session import get_engine, init_db
    from twapza.storage import get_storage

    with get_storage().write_path("projects/old/original.mp4") as p:
        p.write_bytes(b"x")
    with get_engine().begin() as conn:
        conn.execute(text("PRAGMA user_version = 1"))
    init_db()
    assert not get_storage().exists("projects/old/original.mp4")
    with get_engine().connect() as conn:
        assert conn.execute(text("PRAGMA user_version")).scalar() == SCHEMA_VERSION


def test_clip_subtitles_srt(client, ready_project):
    clip = generate(client, ready_project["id"], 15)[0]
    r = client.get(f"/api/clips/{clip['id']}/subtitles.srt")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/x-subrip")
    assert '_simple01_' in r.headers["content-disposition"] and ".srt" in r.headers["content-disposition"]
    first = r.text.split("\n\n")[0].splitlines()
    assert first[0] == "1" and " --> " in first[1] and first[2].startswith("w1 w2")

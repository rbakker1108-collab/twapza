"""YouTube link import: URL parsing, the import job, and a real yt-dlp download (local server)."""

import functools
import http.server
import shutil
import threading

import pytest
from sqlmodel import Session

from tests.conftest import requires_ffmpeg
from twapza.importing import youtube
from twapza.importing.youtube import ImportFailed, VideoInfo, canonical_url, youtube_video_id

VID = "dQw4w9WgXcQ"


@pytest.mark.parametrize("url", [
    f"https://www.youtube.com/watch?v={VID}",
    f"https://youtube.com/watch?v={VID}&t=42s&list=PL123",
    f"http://m.youtube.com/watch?feature=share&v={VID}",
    f"https://music.youtube.com/watch?v={VID}",
    f"www.youtube.com/watch?v={VID}",
    f"https://youtu.be/{VID}?si=abc",
    f"https://www.youtube.com/shorts/{VID}",
    f"https://www.youtube.com/live/{VID}?feature=share",
    f"https://www.youtube.com/embed/{VID}",
    f"  https://YOUTU.BE/{VID}  ",
])
def test_youtube_video_id_accepts_video_links(url):
    assert youtube_video_id(url) == VID


@pytest.mark.parametrize("url", [
    "", "hello", "https://vimeo.com/123456", f"https://www.youtube.com/playlist?list={VID}",
    "https://www.youtube.com/@somechannel", "https://www.youtube.com/watch?v=short",
    f"https://notyoutube.com/watch?v={VID}", f"https://youtube.com.evil.example/watch?v={VID}",
    "https://youtu.be/", "file:///etc/passwd",
])
def test_youtube_video_id_rejects_everything_else(url):
    assert youtube_video_id(url) is None


def test_clean_error_messages():
    assert "private" in youtube._clean_error(Exception("ERROR: [youtube] abc: Private video. Sign in"))
    assert "blocking" in youtube._clean_error(Exception("Sign in to confirm you're not a bot"))
    assert youtube._clean_error(Exception("\x1b[0;31mERROR:\x1b[0m [youtube] x: boom")) == \
        "YouTube download failed: boom"
    assert "Couldn't reach YouTube" in youtube._clean_error(Exception(
        "ERROR: [youtube] x: Unable to download API page: ('Unable to connect to proxy', ...); "
        "please report this issue on https://github.com/yt-dlp/yt-dlp/issues"))
    assert youtube._clean_error(Exception("Weird thing; please report this issue on x")) == \
        "YouTube download failed: Weird thing"


# --- API + job ----------------------------------------------------------------------

@pytest.fixture
def fake_youtube(monkeypatch, sample_video):
    """Replace the network parts of yt-dlp with a copy of the sample video."""
    state = {"info": VideoInfo(id=VID, title='My talk: "part 1"', duration=3.0, is_live=False),
             "urls": [], "before_download": None}

    def fetch_info(url):
        state["urls"].append(url)
        if isinstance(state["info"], Exception):
            raise state["info"]
        return state["info"]

    def download_video(url, dest, *, max_height=1080, on_progress=None):
        if state["before_download"]:
            state["before_download"]()
        for f in (0.0, 0.5, 1.0):
            on_progress(f)
        shutil.copy(sample_video, dest)

    monkeypatch.setattr(youtube, "fetch_info", fetch_info)
    monkeypatch.setattr(youtube, "download_video", download_video)
    return state


def _import(client, url=f"https://youtu.be/{VID}", rights=True):
    return client.post("/api/imports", json={"url": url, "rights_confirmed": rights})


def test_import_creates_a_ready_project(client, fake_youtube):
    r = _import(client)
    assert r.status_code == 201, r.text
    project_id = r.json()["project"]["id"]
    assert fake_youtube["urls"] == [canonical_url(VID)]

    project = client.get(f"/api/projects/{project_id}").json()
    assert project["status"] == "ready"
    assert project["filename"] == "My talk part 1.mp4"
    assert project["source_url"] == canonical_url(VID)
    assert project["duration"] == pytest.approx(3.0, abs=0.2)
    assert project["size_bytes"] > 0
    jobs = {j["type"]: j["status"] for j in project["jobs"]}
    assert jobs["import"] == "succeeded" and jobs["ingest"] == "succeeded"
    assert client.get(f"/api/projects/{project_id}/proxy").status_code == 200


def test_import_requires_rights_and_a_video_link(client, fake_youtube):
    r = _import(client, rights=False)
    assert r.status_code == 400 and "permission" in r.json()["detail"]
    r = _import(client, url="https://vimeo.com/1234")
    assert r.status_code == 400 and "YouTube video link" in r.json()["detail"]
    assert fake_youtube["urls"] == []


def test_import_can_be_turned_off(client, monkeypatch):
    monkeypatch.setenv("TWAPZA_YOUTUBE_ENABLED", "false")
    from twapza.config import get_settings
    get_settings.cache_clear()
    assert client.get("/api/config").json()["youtube_enabled"] is False
    assert _import(client).status_code == 400


def _failed(client, r):
    project = client.get(f"/api/projects/{r.json()['project']['id']}").json()
    assert project["status"] == "failed"
    return project


def test_import_rejects_long_videos_and_live_streams(client, fake_youtube):
    fake_youtube["info"] = VideoInfo(id=VID, title="Long", duration=4 * 3600, is_live=False)
    assert _failed(client, _import(client))["error"] == "Video is 240 min long; the limit is 180 min."
    fake_youtube["info"] = VideoInfo(id=VID, title="Live", duration=None, is_live=True)
    assert "Live streams" in _failed(client, _import(client))["error"]


def test_import_failure_shows_a_readable_message(client, fake_youtube):
    fake_youtube["info"] = ImportFailed("This video is private.")
    project = _failed(client, _import(client))
    assert project["error"] == "This video is private."
    assert {j["type"] for j in project["jobs"]} == {"import"}


def test_import_can_be_canceled(client, fake_youtube, monkeypatch):
    from sqlmodel import select

    from twapza.db.models import Job, JobStatus, JobType
    from twapza.db.session import get_engine
    from twapza.queue import ProgressReporter

    monkeypatch.setattr(ProgressReporter.__init__, "__defaults__", (0.0,))  # no write throttling

    def cancel():
        with Session(get_engine()) as s:
            job = s.exec(select(Job).where(Job.type == JobType.IMPORT)).one()
            job.status = JobStatus.CANCELED
            s.add(job)
            s.commit()

    fake_youtube["before_download"] = cancel
    project = _failed(client, _import(client))
    assert project["error"] == "Import was canceled."
    from twapza.storage import get_storage
    assert get_storage().list_children(f"projects/{project['id']}/") == []


# --- real yt-dlp against a local web server -----------------------------------------

@requires_ffmpeg
def test_download_video_with_real_yt_dlp(tmp_path, sample_video):
    served = tmp_path / "www"
    served.mkdir()
    shutil.copy(sample_video, served / "video.mp4")
    handler = functools.partial(_QuietHandler, directory=str(served))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f"http://127.0.0.1:{server.server_port}/video.mp4"
        seen: list[float] = []
        dest = tmp_path / "out" / "original.mp4"
        dest.parent.mkdir()
        youtube.download_video(url, dest, on_progress=seen.append)
        assert dest.read_bytes() == sample_video.read_bytes()
        assert seen[-1] == 1.0
        assert [p.name for p in dest.parent.iterdir()] == ["original.mp4"]  # work dir removed

        def stop(_fraction):
            raise RuntimeError("stop")

        with pytest.raises(RuntimeError, match="stop"):
            youtube.download_video(url, tmp_path / "out" / "again.mp4", on_progress=stop)
        assert [p.name for p in dest.parent.iterdir()] == ["original.mp4"]

        with pytest.raises(ImportFailed, match="YouTube download failed"):
            youtube.download_video(url.replace("video", "missing"), tmp_path / "out" / "x.mp4")
    finally:
        server.shutdown()


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

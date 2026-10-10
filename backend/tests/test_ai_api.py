import json

import pytest

from tests.conftest import make_test_video, requires_ffmpeg, upload_file
from twapza.config import get_settings

pytestmark = requires_ffmpeg


class FakeHighlighter:
    """Returns scripted model output per chunk (mimics Claude's JSON answer)."""

    def __init__(self, answers=None):
        self.answers = answers
        self.calls = []

    def find(self, chunk, *, video_title, video_duration, total_chunks):
        self.calls.append(chunk.index)
        if self.answers is not None:
            return self.answers(chunk)
        s = chunk.start
        return json.dumps({"clips": [
            {"start": s + 2, "end": s + 22, "title": "Strong opener", "hook": "w5 w6",
             "score": 92, "reason": "Bold claim up front."},
            # the same moment, slightly shifted: should be de-duplicated
            {"start": s + 3, "end": s + 23, "title": "Duplicate", "hook": "",
             "score": 60, "reason": "Same idea."},
            {"start": s + 30, "end": s + 50, "title": "Nice takeaway", "hook": "w60",
             "score": 75, "reason": "Clear tip."},
        ]})


@pytest.fixture
def with_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    get_settings.cache_clear()


@pytest.fixture
def highlighter(monkeypatch):
    fake = FakeHighlighter()
    monkeypatch.setattr("twapza.workers.tasks.get_highlighter", lambda: fake)
    return fake


@pytest.fixture(scope="session")
def podcast_video(tmp_path_factory):
    """A 70s test video, generated once for the whole session."""
    return make_test_video(tmp_path_factory.mktemp("media") / "Podcast.mp4", seconds=70)


@pytest.fixture
def project(client, podcast_video, monkeypatch):
    monkeypatch.setenv("TWAPZA_EXPORT_PRESET", "ultrafast")
    get_settings.cache_clear()
    pid = upload_file(client, podcast_video)["project"]["id"]
    return client.get(f"/api/projects/{pid}").json()


def run_ai(client, pid):
    r = client.post(f"/api/projects/{pid}/ai-clips")
    assert r.status_code == 202, r.text
    return client.get(f"/api/jobs/{r.json()['id']}").json()


def test_requires_api_key(client, project):
    assert client.get("/api/config").json()["ai_enabled"] is False
    r = client.post(f"/api/projects/{project['id']}/ai-clips")
    assert r.status_code == 400 and "ANTHROPIC_API_KEY" in r.json()["detail"]


def test_ai_highlights_end_to_end(client, project, with_key, highlighter):
    assert client.get("/api/config").json()["ai_enabled"] is True
    job = run_ai(client, project["id"])
    assert job["status"] == "succeeded", job
    assert highlighter.calls == [0]  # 70s of speech = one chunk

    clips = client.get(f"/api/projects/{project['id']}/clips?source=ai").json()
    assert [c["title"] for c in clips] == ["Strong opener", "Nice takeaway"]  # ranked, deduped
    top = clips[0]
    assert top["index"] == 1 and top["source"] == "ai"
    assert top["hook"] == "w5 w6" and top["reason"] == "Bold claim up front."
    assert 0 < top["score"] <= 100
    assert top["suggested_start"] == top["start"] and top["suggested_end"] == top["end"]
    assert 15 <= top["end"] - top["start"] <= 90
    assert top["text"]
    assert client.get(top["thumbnail_url"]).headers["content-type"] == "image/jpeg"

    # Simple clips are untouched by AI runs and vice versa
    assert client.get(f"/api/projects/{project['id']}/clips?source=simple").json() == []

    # Regenerating replaces previous AI clips
    run_ai(client, project["id"])
    again = client.get(f"/api/projects/{project['id']}/clips?source=ai").json()
    assert {c["id"] for c in again}.isdisjoint({c["id"] for c in clips})


def test_trim_updates_clip_text_thumbnail_and_export(client, project, with_key, highlighter, tmp_path):
    from twapza.media import ffmpeg as media

    run_ai(client, project["id"])
    clip = client.get(f"/api/projects/{project['id']}/clips?source=ai").json()[0]

    r = client.patch(f"/api/clips/{clip['id']}", json={"start": 10.0, "end": 16.5})
    assert r.status_code == 200, r.text
    trimmed = r.json()
    assert (trimmed["start"], trimmed["end"], trimmed["duration"]) == (10.0, 16.5, 6.5)
    assert trimmed["suggested_start"] == clip["start"]  # original suggestion kept for "reset"
    assert trimmed["thumbnail_url"] != clip["thumbnail_url"]
    assert client.get(trimmed["thumbnail_url"]).status_code == 200
    assert trimmed["text"] != clip["text"]

    job = client.post(f"/api/clips/{clip['id']}/export",
                      json={"settings": {"aspect": "original", "upscale_1080": False}}).json()
    out = tmp_path / "trimmed.mp4"
    out.write_bytes(client.get(job["download_url"]).content)
    assert media.probe(out).duration == pytest.approx(6.5, abs=0.15)


@pytest.mark.parametrize("body,status", [
    ({"start": 20, "end": 10}, 400),       # reversed
    ({"start": 10, "end": 11}, 400),       # under 3s
    ({"start": 0, "end": 500}, 200),       # end clamped to video length
    ({"start": -1, "end": 10}, 422),
])
def test_trim_validation(client, project, with_key, highlighter, body, status):
    run_ai(client, project["id"])
    clip = client.get(f"/api/projects/{project['id']}/clips?source=ai").json()[0]
    r = client.patch(f"/api/clips/{clip['id']}", json=body)
    assert r.status_code == status, r.text
    if status == 200:
        assert r.json()["end"] == pytest.approx(project["duration"], abs=0.01)


def test_readable_failures(client, project, with_key, monkeypatch):
    nothing = FakeHighlighter(answers=lambda chunk: '{"clips": []}')
    monkeypatch.setattr("twapza.workers.tasks.get_highlighter", lambda: nothing)
    job = run_ai(client, project["id"])
    assert job["status"] == "failed" and "didn't find any moments" in job["error"]

    from twapza.clipping.llm import HighlightError

    def boom(chunk):
        raise HighlightError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.")
    monkeypatch.setattr("twapza.workers.tasks.get_highlighter", lambda: FakeHighlighter(answers=boom))
    job = run_ai(client, project["id"])
    assert job["status"] == "failed" and "API key was rejected" in job["error"]


def test_video_without_speech_fails_clearly(client, tmp_path, with_key, highlighter):
    video = make_test_video(tmp_path / "silent.mp4", seconds=20, audio=False)
    pid = upload_file(client, video)["project"]["id"]
    job = run_ai(client, pid)
    assert job["status"] == "failed" and "need speech" in job["error"]


def test_scene_detection_failure_does_not_fail_the_job(client, project, with_key, highlighter, monkeypatch):
    def broken(*a, **k):
        raise RuntimeError("opencv missing")
    monkeypatch.setattr("twapza.workers.tasks.detect_scene_cuts", broken)
    assert run_ai(client, project["id"])["status"] == "succeeded"


def test_scene_cuts_are_cached(client, project, with_key, highlighter, monkeypatch):
    calls = []
    monkeypatch.setattr("twapza.workers.tasks.detect_scene_cuts",
                        lambda *a, **k: calls.append(1) or [12.0])
    run_ai(client, project["id"])
    run_ai(client, project["id"])
    assert calls == [1]


def test_missing_thumbnail_is_regenerated(client, project, with_key, highlighter, isolated_env):
    import shutil

    run_ai(client, project["id"])
    clip = client.get(f"/api/projects/{project['id']}/clips?source=ai").json()[0]
    shutil.rmtree(isolated_env / "storage" / "projects" / project["id"] / "thumbs")
    assert client.get(clip["thumbnail_url"]).status_code == 200


def test_export_with_captions(client, project, with_key, highlighter, tmp_path):
    """Captions are burned in for the (trimmed) clip range; bad colours are rejected."""
    from twapza.media import ffmpeg as media

    run_ai(client, project["id"])
    clip = client.get(f"/api/projects/{project['id']}/clips?source=ai").json()[0]
    settings = {"aspect": "9:16", "captions": {"font": "bebas", "highlight_color": "#00FF00",
                                               "position": "middle", "words_per_line": 2}}
    job = client.post(f"/api/clips/{clip['id']}/export", json={"settings": settings}).json()
    assert job["status"] == "succeeded", job
    out = tmp_path / "captioned.mp4"
    out.write_bytes(client.get(job["download_url"]).content)
    assert (media.probe(out).width, media.probe(out).height) == (1080, 1920)

    plain = client.post(f"/api/clips/{clip['id']}/export",
                        json={"settings": {"aspect": "9:16"}}).json()
    assert plain["id"] != job["id"]
    assert client.get(plain["download_url"]).content != out.read_bytes()

    bad = client.post(f"/api/clips/{clip['id']}/export",
                      json={"settings": {"captions": {"text_color": "white"}}})
    assert bad.status_code == 422


def test_fonts_are_served(client):
    r = client.get("/api/fonts/Anton-Regular.ttf")
    assert r.status_code == 200 and len(r.content) > 10000

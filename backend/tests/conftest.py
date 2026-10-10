import shutil
import subprocess
from pathlib import Path

import pytest
from fakeredis import FakeRedis
from fastapi.testclient import TestClient
from rq import Queue

from twapza.config import get_settings
from twapza.db.session import get_engine, init_db
from twapza.queue import get_queue, get_redis
from twapza.storage import get_storage
from twapza.transcription import Segment, Transcript, Word

HAS_FFMPEG = shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None
requires_ffmpeg = pytest.mark.skipif(not HAS_FFMPEG, reason="ffmpeg/ffprobe not installed")


def _clear_caches() -> None:
    for cached in (get_settings, get_engine, get_storage, get_redis):
        cached.cache_clear()


@pytest.fixture(autouse=True)
def isolated_env(tmp_path, monkeypatch):
    """Point every test at its own storage dir and SQLite DB."""
    monkeypatch.chdir(tmp_path)  # so a developer's .env is never picked up
    monkeypatch.setenv("TWAPZA_STORAGE_ROOT", str(tmp_path / "storage"))
    monkeypatch.setenv("TWAPZA_DATABASE_URL", f"sqlite:///{tmp_path / 'twapza.db'}")
    monkeypatch.setenv("TWAPZA_CHUNK_SIZE_MB", "1")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    _clear_caches()
    init_db()
    yield tmp_path
    get_engine().dispose()
    _clear_caches()


def scripted_words(duration: float, *, words_per_sentence: int = 8, word_len: float = 0.3,
                   word_gap: float = 0.1, sentence_gap: float = 0.7) -> list[Word]:
    """Synthetic speech: sentences of N words separated by longer pauses."""
    words, t, n = [], 0.5, 0
    while t + word_len < duration:
        n += 1
        last = n % words_per_sentence == 0
        words.append(Word(text=f" w{n}{'.' if last else ''}", start=round(t, 3),
                          end=round(t + word_len, 3)))
        t += word_len + (sentence_gap if last else word_gap)
    return words


class FakeTranscriber:
    """Deterministic stand-in for faster-whisper (no model download in tests)."""

    def __init__(self):
        self.calls = 0

    def transcribe(self, audio_path, *, duration, on_progress=None):
        self.calls += 1
        words = scripted_words(duration)
        if on_progress:
            on_progress(1.0)
        return Transcript(language="en", duration=duration,
                          segments=[Segment(start=0, end=duration, text="", words=words)])


@pytest.fixture(autouse=True)
def fake_transcriber(monkeypatch) -> FakeTranscriber:
    fake = FakeTranscriber()
    monkeypatch.setattr("twapza.transcription.get_transcriber", lambda: fake)
    return fake


@pytest.fixture
def sync_queue(monkeypatch) -> Queue:
    """An RQ queue that runs jobs inline, backed by an in-memory Redis.

    Also used for jobs that workers enqueue themselves (e.g. transcription after ingest).
    """
    queue = Queue("twapza-test", is_async=False, connection=FakeRedis())
    monkeypatch.setattr("twapza.queue.get_queue", lambda: queue)
    return queue


@pytest.fixture
def client(sync_queue):
    from twapza.api.app import create_app

    app = create_app()
    app.dependency_overrides[get_queue] = lambda: sync_queue
    with TestClient(app) as c:
        yield c


def make_test_video(path: Path, *, seconds: float = 3, audio: bool = True,
                    size: str = "320x240") -> Path:
    """Generate a small synthetic video with ffmpeg (test pattern + sine tone)."""
    args = ["ffmpeg", "-hide_banner", "-v", "error", "-y",
            "-f", "lavfi", "-i", f"testsrc=duration={seconds}:size={size}:rate=25"]
    if audio:
        args += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}"]
    args += ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast"]
    if audio:
        args += ["-c:a", "aac", "-shortest"]
    args.append(str(path))
    subprocess.run(args, check=True)
    return path


def upload_file(client, path: Path, filename: str | None = None) -> dict:
    """Upload a file through the chunked upload API and complete it."""
    data = path.read_bytes()
    r = client.post("/api/uploads", json={
        "filename": filename or path.name, "size_bytes": len(data), "rights_confirmed": True})
    assert r.status_code == 201, r.text
    session = r.json()
    size = session["chunk_size"]
    for i in range(session["total_chunks"]):
        put = client.put(f"/api/uploads/{session['project_id']}/chunks/{i}",
                         content=data[i * size:(i + 1) * size])
        assert put.status_code == 204, put.text
    done = client.post(f"/api/uploads/{session['project_id']}/complete")
    assert done.status_code == 200, done.text
    return done.json()


@pytest.fixture
def sample_video(tmp_path) -> Path:
    if not HAS_FFMPEG:
        pytest.skip("ffmpeg not installed")
    return make_test_video(tmp_path / "sample.mp4")

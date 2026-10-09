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


@pytest.fixture
def sync_queue() -> Queue:
    """An RQ queue that runs jobs inline, backed by an in-memory Redis."""
    return Queue("twapza-test", is_async=False, connection=FakeRedis())


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


@pytest.fixture
def sample_video(tmp_path) -> Path:
    if not HAS_FFMPEG:
        pytest.skip("ffmpeg not installed")
    return make_test_video(tmp_path / "sample.mp4")

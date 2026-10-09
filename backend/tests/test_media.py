import pytest

from tests.conftest import make_test_video, requires_ffmpeg
from twapza.media import ffmpeg

pytestmark = requires_ffmpeg


def test_probe(sample_video):
    info = ffmpeg.probe(sample_video)
    assert abs(info.duration - 3) < 0.2
    assert (info.width, info.height) == (320, 240)
    assert info.fps == 25
    assert info.video_codec == "h264"
    assert info.has_audio


def test_probe_without_audio(tmp_path):
    info = ffmpeg.probe(make_test_video(tmp_path / "silent.mkv", audio=False))
    assert not info.has_audio


def test_probe_rejects_non_video(tmp_path):
    junk = tmp_path / "junk.mp4"
    junk.write_bytes(b"\x00" * 1000)
    with pytest.raises(ffmpeg.MediaError):
        ffmpeg.probe(junk)


def test_proxy_never_upscales_and_reports_progress(sample_video, tmp_path):
    out = tmp_path / "proxy.mp4"
    seen: list[float] = []
    ffmpeg.make_proxy(sample_video, out, max_height=720, duration=3, on_progress=seen.append)
    info = ffmpeg.probe(out)
    assert info.height == 240
    assert info.has_audio
    assert seen and seen[-1] == 1.0
    assert all(0 <= p <= 1 for p in seen)


def test_proxy_downscales_to_even_dimensions(tmp_path):
    src = make_test_video(tmp_path / "big.mov", seconds=1, size="1280x720")
    out = tmp_path / "proxy.mp4"
    ffmpeg.make_proxy(src, out, max_height=361)
    info = ffmpeg.probe(out)
    assert info.height == 360
    assert info.width % 2 == 0


def test_extract_audio(sample_video, tmp_path):
    out = tmp_path / "audio.wav"
    ffmpeg.extract_audio(sample_video, out)
    assert out.stat().st_size > 16000 * 2  # >1s of 16-bit mono


def test_cut_clip_is_accurate_and_leaves_source_untouched(tmp_path):
    src = make_test_video(tmp_path / "long.mp4", seconds=10)
    before = src.read_bytes()
    out = tmp_path / "clip.mp4"
    seen: list[float] = []
    ffmpeg.cut_clip(src, out, 2.5, 6.25, preset="ultrafast", on_progress=seen.append)
    info = ffmpeg.probe(out)
    assert info.duration == pytest.approx(3.75, abs=0.1)
    assert info.has_audio
    assert seen[-1] == 1.0
    assert src.read_bytes() == before


def test_cut_clip_without_audio(tmp_path):
    src = make_test_video(tmp_path / "silent.mp4", seconds=4, audio=False)
    out = tmp_path / "clip.mp4"
    ffmpeg.cut_clip(src, out, 1, 3, preset="ultrafast")
    info = ffmpeg.probe(out)
    assert info.duration == pytest.approx(2, abs=0.1)
    assert not info.has_audio


def test_cut_clip_rejects_empty_range(tmp_path, sample_video):
    with pytest.raises(ffmpeg.MediaError):
        ffmpeg.cut_clip(sample_video, tmp_path / "x.mp4", 2, 2)


def test_extract_frame(sample_video, tmp_path):
    out = tmp_path / "thumb.jpg"
    ffmpeg.extract_frame(sample_video, out, 1.0, height=120)
    assert out.read_bytes()[:2] == b"\xff\xd8"  # JPEG magic

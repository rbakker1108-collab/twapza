import subprocess

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


@pytest.mark.parametrize("w,h", [(1920, 1080), (1080, 1920), (3840, 2160), (1080, 1080), (0, 0)])
def test_upscale_filter_skips_videos_already_1080p_or_larger(w, h):
    assert ffmpeg.upscale_filter(w, h) is None


def test_upscale_filter_for_small_videos():
    vf = ffmpeg.upscale_filter(1280, 720)
    assert vf is not None and "lanczos" in vf and "1080" in vf


@pytest.mark.parametrize("size,expected", [
    ("320x240", (1440, 1080)),   # 4:3 landscape
    ("640x360", (1920, 1080)),   # 16:9 landscape
    ("360x640", (1080, 1920)),   # 9:16 portrait (phone)
    ("300x300", (1080, 1080)),   # square
    ("854x480", (1922, 1080)),   # not exactly 16:9: proportional, kept even
])
def test_cut_clip_upscales_to_1080p(tmp_path, size, expected):
    w, h = map(int, size.split("x"))
    src = make_test_video(tmp_path / "small.mp4", seconds=2, size=size)
    out = tmp_path / "up.mp4"
    ffmpeg.cut_clip(src, out, 0, 1, preset="ultrafast", video_filter=ffmpeg.upscale_filter(w, h))
    info = ffmpeg.probe(out)
    assert (info.width, info.height) == expected
    assert info.width % 2 == 0 and info.height % 2 == 0


def test_upscale_respects_rotation_flag(tmp_path):
    """Phone video stored as 640x360 with a 90° rotation flag displays as 360x640."""
    src = make_test_video(tmp_path / "landscape.mp4", seconds=2, size="640x360")
    rotated = tmp_path / "rotated.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-display_rotation", "90", "-i", str(src),
                    "-c", "copy", str(rotated)], check=True)
    info = ffmpeg.probe(rotated)  # reports stored (unrotated) size
    out = tmp_path / "up.mp4"
    ffmpeg.cut_clip(rotated, out, 0, 1, preset="ultrafast",
                    video_filter=ffmpeg.upscale_filter(info.width, info.height))
    up = ffmpeg.probe(out)
    assert (up.width, up.height) == (1080, 1920)


@pytest.mark.parametrize("mode", ["crop", "blur"])
@pytest.mark.parametrize("size", ["1280x720", "640x360", "320x240", "1080x1920", "300x300", "854x480"])
def test_vertical_export_is_always_1080x1920(tmp_path, mode, size):
    src = make_test_video(tmp_path / "in.mp4", seconds=2, size=size)
    out = tmp_path / "vertical.mp4"
    ffmpeg.cut_clip(src, out, 0, 1, preset="ultrafast", video_filter=ffmpeg.vertical_filter(mode))
    info = ffmpeg.probe(out)
    assert (info.width, info.height) == (1080, 1920)
    assert info.has_audio


def _frame_rgb(path, x, y):
    """RGB of one pixel of the first frame."""
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-frames:v", "1",
         "-vf", f"format=rgb24,crop=1:1:{x}:{y}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        check=True, capture_output=True).stdout
    return tuple(raw[:3])


def _split_colour_video(path):
    """1280x720: left third red, middle third green, right third blue."""
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y",
         "-f", "lavfi", "-i", "color=red:size=427x720:d=1",
         "-f", "lavfi", "-i", "color=green:size=426x720:d=1",
         "-f", "lavfi", "-i", "color=blue:size=427x720:d=1",
         "-filter_complex", "[0][1][2]hstack=3", "-c:v", "libx264", "-preset", "ultrafast",
         "-pix_fmt", "yuv420p", str(path)], check=True)
    return path


def test_vertical_crop_takes_the_centre(tmp_path):
    src = _split_colour_video(tmp_path / "split.mp4")
    out = tmp_path / "v.mp4"
    ffmpeg.cut_clip(src, out, 0, 0.5, preset="ultrafast", video_filter=ffmpeg.vertical_filter("crop"))
    # A centred 405px-wide slice of a 1280px frame lies inside the green middle third.
    for x in (20, 540, 1060):
        r, g, b = _frame_rgb(out, x, 960)
        assert g > 100 and r < 80 and b < 80, (x, (r, g, b))


def test_vertical_blur_keeps_the_whole_frame(tmp_path):
    src = _split_colour_video(tmp_path / "split.mp4")
    out = tmp_path / "v.mp4"
    ffmpeg.cut_clip(src, out, 0, 0.5, preset="ultrafast", video_filter=ffmpeg.vertical_filter("blur"))
    # The full 16:9 frame is fitted across the width in the vertical middle:
    # red on the left, green centre, blue on the right.
    left, centre, right = (_frame_rgb(out, x, 960) for x in (60, 540, 1020))
    assert left[0] > 150 and centre[1] > 100 and right[2] > 150, (left, centre, right)


def test_vertical_rejects_unknown_mode():
    with pytest.raises(ValueError):
        ffmpeg.vertical_filter("stretch")

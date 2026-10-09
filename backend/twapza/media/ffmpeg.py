"""Thin wrappers around ffprobe / ffmpeg.

All media processing in Twapza goes through this module. Every function takes
explicit input/output paths and never modifies its input.
"""

import json
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

ProgressCallback = Callable[[float], None]
"""Called with a fraction in [0, 1]."""


class MediaError(Exception):
    """Raised for unreadable/unsupported media or a failed ffmpeg run."""


@dataclass(frozen=True)
class MediaInfo:
    duration: float
    width: int
    height: int
    fps: float
    video_codec: str
    audio_codec: str | None

    @property
    def has_audio(self) -> bool:
        return self.audio_codec is not None


def _parse_fps(rate: str | None) -> float:
    try:
        value = float(Fraction(rate)) if rate else 0.0
    except (ValueError, ZeroDivisionError):
        value = 0.0
    return round(value, 3)


def probe(path: Path) -> MediaInfo:
    cmd = [
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_format", "-show_streams", str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise MediaError(f"Could not read video file: {result.stderr.strip() or 'ffprobe failed'}")
    data = json.loads(result.stdout or "{}")
    streams = data.get("streams", [])
    video = next(
        (s for s in streams
         if s.get("codec_type") == "video" and not s.get("disposition", {}).get("attached_pic")),
        None,
    )
    if video is None:
        raise MediaError("File has no video stream.")
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)

    duration_raw = data.get("format", {}).get("duration") or video.get("duration")
    try:
        duration = float(duration_raw)
    except (TypeError, ValueError):
        raise MediaError("Could not determine video duration.") from None
    if duration <= 0:
        raise MediaError("Video has zero duration.")

    return MediaInfo(
        duration=duration,
        width=int(video.get("width") or 0),
        height=int(video.get("height") or 0),
        fps=_parse_fps(video.get("avg_frame_rate") or video.get("r_frame_rate")),
        video_codec=video.get("codec_name", "unknown"),
        audio_codec=audio.get("codec_name") if audio else None,
    )


def run_ffmpeg(
    args: list[str],
    *,
    duration: float | None = None,
    on_progress: ProgressCallback | None = None,
) -> None:
    """Run ffmpeg with machine-readable progress on stdout.

    ``duration`` is the expected output duration in seconds, used to turn
    ffmpeg's ``out_time`` into a fraction for ``on_progress``.
    """
    cmd = ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-v", "error",
           "-progress", "pipe:1", "-nostats", *args]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    assert proc.stdout is not None and proc.stderr is not None
    for line in proc.stdout:
        key, _, value = line.strip().partition("=")
        if on_progress and duration and key == "out_time_us" and value.isdigit():
            on_progress(min(1.0, int(value) / 1_000_000 / duration))
    stderr = proc.stderr.read()
    if proc.wait() != 0:
        tail = "\n".join(stderr.strip().splitlines()[-5:])
        raise MediaError(f"ffmpeg failed: {tail or 'unknown error'}")
    if on_progress:
        on_progress(1.0)


def extract_audio(src: Path, dst: Path, *, duration: float | None = None,
                  on_progress: ProgressCallback | None = None) -> None:
    """Extract 16 kHz mono PCM WAV (the format Whisper expects)."""
    run_ffmpeg(
        ["-i", str(src), "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
         "-c:a", "pcm_s16le", "-f", "wav", str(dst)],
        duration=duration, on_progress=on_progress,
    )


def make_proxy(src: Path, dst: Path, *, max_height: int = 720, has_audio: bool = True,
               duration: float | None = None, on_progress: ProgressCallback | None = None) -> None:
    """Browser-friendly H.264/AAC mp4 used for previews and the trim UI."""
    # Never upscale; keep dimensions even (required by yuv420p/libx264).
    vf = f"scale=-2:'trunc(min({max_height},ih)/2)*2'"
    args = ["-i", str(src), "-map", "0:v:0"]
    if has_audio:
        args += ["-map", "0:a:0", "-c:a", "aac", "-b:a", "128k", "-ac", "2"]
    args += [
        "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-f", "mp4", str(dst),
    ]
    run_ffmpeg(args, duration=duration, on_progress=on_progress)

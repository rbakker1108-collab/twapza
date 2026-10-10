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
    rotation: int = 0  # display rotation in degrees (phone videos), 0/90/180/270

    @property
    def has_audio(self) -> bool:
        return self.audio_codec is not None

    @property
    def display_size(self) -> tuple[int, int]:
        """Width × height as shown to viewers (ffmpeg auto-rotates when decoding)."""
        if self.rotation in (90, 270):
            return self.height, self.width
        return self.width, self.height


def _parse_fps(rate: str | None) -> float:
    try:
        value = float(Fraction(rate)) if rate else 0.0
    except (ValueError, ZeroDivisionError):
        value = 0.0
    return round(value, 3)


def _rotation(stream: dict) -> int:
    raw = None
    for side in stream.get("side_data_list") or []:
        if "rotation" in side:
            raw = side["rotation"]
    if raw is None:
        raw = (stream.get("tags") or {}).get("rotate")
    try:
        return int(round(float(raw))) % 360 if raw is not None else 0
    except (TypeError, ValueError):
        return 0


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
        rotation=_rotation(video),
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


def upscale_filter(width: int, height: int, min_short_side: int = 1080) -> str | None:
    """ffmpeg filter that upscales so the shorter side is ``min_short_side`` px.

    Returns ``None`` when the video is already at least that size (never downscales).
    The output size is computed by ffmpeg from the decoded frames, so videos with a
    rotation flag (common on phones) keep the right orientation. Lanczos scaling
    plus a light sharpen; this makes low-res footage look cleaner on platforms that
    expect 1080p, but it cannot add detail that isn't in the source.
    """
    if not width or not height or min(width, height) >= min_short_side:
        return None
    m = min_short_side
    w = f"if(lt(iw,ih),{m},-2)"
    h = f"if(lt(iw,ih),-2,{m})"
    return f"scale='{w}':'{h}':flags=lanczos,setsar=1,unsharp=5:5:0.5:5:5:0"


VERTICAL_SIZE = (1080, 1920)


def vertical_filter(mode: str = "crop") -> str:
    """ffmpeg filter producing a 1080x1920 (9:16) frame for Shorts / TikTok / Reels.

    ``crop``: take the largest centred 9:16 region and scale it to 1080x1920.
    ``blur``: fit the whole frame inside 1080x1920 over a blurred, zoomed copy of
    itself (nothing is cut off; good for screen recordings and wide shots).
    Expressions are evaluated on the decoded frames, so rotated phone videos work.
    """
    w, h = VERTICAL_SIZE
    if mode == "crop":
        return (f"crop='min(iw,ih*9/16)':'min(ih,iw*16/9)',"
                f"scale={w}:{h}:flags=lanczos,setsar=1,unsharp=5:5:0.5:5:5:0")
    if mode == "blur":
        # Blur at quarter resolution for speed, then scale back up.
        return (f"split[bg][fg];"
                f"[bg]scale={w // 4}:{h // 4}:force_original_aspect_ratio=increase,"
                f"crop={w // 4}:{h // 4},boxblur=8:2,scale={w}:{h},setsar=1[bgo];"
                f"[fg]scale={w}:{h}:force_original_aspect_ratio=decrease:force_divisible_by=2"
                f":flags=lanczos,setsar=1[fgo];"
                f"[bgo][fgo]overlay=(W-w)/2:(H-h)/2")
    raise ValueError(f"unknown vertical mode: {mode!r}")


_UNSAFE_FILTER_CHARS = set("'\\:,;[]")


def ass_filter(ass_path: Path, fonts_dir: Path) -> str:
    """ffmpeg filter that burns an ASS subtitle file using fonts from ``fonts_dir``.

    Paths are embedded in the filter string, so they must not contain characters
    the filtergraph parser treats specially (we only pass our own temp/package paths).
    """
    for p in (ass_path, fonts_dir):
        if _UNSAFE_FILTER_CHARS & set(str(p)):
            raise MediaError(f"unsupported characters in path: {p}")
    return f"ass=filename='{ass_path}':fontsdir='{fonts_dir}'"


def join_filters(*filters: str | None) -> str | None:
    """Chain filters (each may itself be a chain or a labelled graph ending in one output)."""
    parts = [f for f in filters if f]
    return ",".join(parts) if parts else None


def cut_clip(src: Path, dst: Path, start: float, end: float, *, preset: str = "veryfast",
             crf: int = 20, video_filter: str | None = None,
             on_progress: ProgressCallback | None = None) -> None:
    """Re-encode ``[start, end)`` of ``src`` into a new H.264/AAC mp4.

    Always re-encodes (never stream-copies) so the cut is frame-accurate rather
    than snapping to the nearest keyframe. ``video_filter`` is an optional ffmpeg
    filter chain (e.g. from ``upscale_filter``).
    """
    if end <= start:
        raise MediaError("Clip end must be after its start.")
    duration = end - start
    vf = ["-vf", video_filter] if video_filter else []
    run_ffmpeg(
        ["-ss", f"{start:.3f}", "-i", str(src), "-t", f"{duration:.3f}",
         "-map", "0:v:0", "-map", "0:a:0?", *vf,
         "-c:v", "libx264", "-preset", preset, "-crf", str(crf), "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "160k",
         "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", "-f", "mp4", str(dst)],
        duration=duration, on_progress=on_progress,
    )


def extract_frame(src: Path, dst: Path, at: float, *, height: int = 270) -> None:
    """Save a single JPEG frame (used for clip thumbnails)."""
    run_ffmpeg(
        ["-ss", f"{max(0.0, at):.3f}", "-i", str(src), "-frames:v", "1",
         "-vf", f"scale=-2:{height}", "-q:v", "4", "-f", "image2", str(dst)],
    )

"""Export settings and deterministic export file naming.

An export is identified by the clip's current start/end plus the export
settings, so re-exporting an unchanged clip reuses the existing file, while a
trimmed clip or different settings produce a new one.
"""

import hashlib
import re
from typing import Literal

from pydantic import BaseModel

from twapza.db.models import Clip, Project
from twapza.media import ffmpeg


class ExportSettings(BaseModel):
    # "9:16" = vertical 1080x1920 for YouTube Shorts / TikTok / Reels.
    # Stage 4 adds caption options.
    aspect: Literal["original", "9:16"] = "original"
    # How landscape footage fills the vertical frame (only used for "9:16").
    vertical_fit: Literal["crop", "blur"] = "crop"
    # Upscale clips whose shorter side is below 1080 px to 1080p (only used for
    # "original"; vertical exports are always 1080x1920).
    upscale_1080: bool = True

    def normalized(self) -> "ExportSettings":
        """Drop options that don't affect the output, so equal outputs share a cache key."""
        if self.aspect == "9:16":
            return self.model_copy(update={"upscale_1080": False})
        return self.model_copy(update={"vertical_fit": "crop"})


def video_filter(settings: ExportSettings, width: int, height: int) -> str | None:
    """The ffmpeg video filter for these export settings and source size."""
    if settings.aspect == "9:16":
        return ffmpeg.vertical_filter(settings.vertical_fit)
    if settings.upscale_1080:
        return ffmpeg.upscale_filter(width, height)
    return None


def export_key(clip: Clip, settings: ExportSettings) -> str:
    fingerprint = f"{clip.start:.3f}|{clip.end:.3f}|{settings.normalized().model_dump_json()}"
    digest = hashlib.sha256(fingerprint.encode()).hexdigest()[:16]
    return f"{clip.exports_prefix}{digest}.mp4"


def _timestamp(seconds: float) -> str:
    s = int(seconds)
    h, m, sec = s // 3600, s % 3600 // 60, s % 60
    return f"{h}h{m:02d}m{sec:02d}s" if h else f"{m:02d}m{sec:02d}s"


def safe_stem(name: str) -> str:
    stem = re.sub(r"[^\w\-. ]+", "", name, flags=re.UNICODE).strip().replace(" ", "_")
    return stem[:80] or "video"


def export_filename(project: Project, clip: Clip, settings: ExportSettings | None = None) -> str:
    suffix = "_vertical" if settings and settings.aspect == "9:16" else ""
    return (f"{safe_stem(project.stem)}_{clip.source.value}{clip.index:02d}_"
            f"{_timestamp(clip.start)}-{_timestamp(clip.end)}{suffix}.mp4")


def zip_filename(project: Project) -> str:
    return f"{safe_stem(project.stem)}_clips.zip"

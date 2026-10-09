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


class ExportSettings(BaseModel):
    # Stage 4 adds "9:16" and caption options.
    aspect: Literal["original"] = "original"
    # Upscale clips whose shorter side is below 1080 px to 1080p (never downscales).
    upscale_1080: bool = True


def export_key(clip: Clip, settings: ExportSettings) -> str:
    fingerprint = f"{clip.start:.3f}|{clip.end:.3f}|{settings.model_dump_json()}"
    digest = hashlib.sha256(fingerprint.encode()).hexdigest()[:16]
    return f"{clip.exports_prefix}{digest}.mp4"


def _timestamp(seconds: float) -> str:
    s = int(seconds)
    h, m, sec = s // 3600, s % 3600 // 60, s % 60
    return f"{h}h{m:02d}m{sec:02d}s" if h else f"{m:02d}m{sec:02d}s"


def safe_stem(name: str) -> str:
    stem = re.sub(r"[^\w\-. ]+", "", name, flags=re.UNICODE).strip().replace(" ", "_")
    return stem[:80] or "video"


def export_filename(project: Project, clip: Clip) -> str:
    return (f"{safe_stem(project.stem)}_{clip.source.value}{clip.index:02d}_"
            f"{_timestamp(clip.start)}-{_timestamp(clip.end)}.mp4")


def zip_filename(project: Project) -> str:
    return f"{safe_stem(project.stem)}_clips.zip"

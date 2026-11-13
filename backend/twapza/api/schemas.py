import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from twapza.exports import ExportSettings

from twapza.db.models import Clip, ClipSource, Job, JobStatus, JobType, Project, ProjectStatus


class CreateImport(BaseModel):
    url: str = Field(min_length=1, max_length=500)
    rights_confirmed: bool


class WaitlistRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    lang: Literal["en", "nl", "es", "de", "fr", "ar"] = "en"


class UpdateCredit(BaseModel):
    """Who made the original video (shown as a credit in clip descriptions). Empty = none."""
    source_title: str | None = Field(default=None, max_length=300)
    source_channel: str | None = Field(default=None, max_length=200)
    source_url: str | None = Field(default=None, max_length=500)
    source_channel_url: str | None = Field(default=None, max_length=500)

    @field_validator("*", mode="after")
    @classmethod
    def _blank_is_none(cls, value: str | None) -> str | None:
        value = " ".join(value.split()) if value else ""
        return value or None

    @field_validator("source_url", "source_channel_url", mode="after")
    @classmethod
    def _http_url(cls, value: str | None) -> str | None:
        if value and not value.lower().startswith(("https://", "http://")):
            raise ValueError("must be a link starting with https://")
        return value


class ClipDescription(BaseModel):
    text: str               # ready to paste: description, credit, hashtags
    description: str
    hashtags: list[str]
    titles: list[str]       # suggested Shorts titles (also usable as the hook text)
    credit: str | None
    ai: bool                # written by Claude (False = simple fallback text)


class CreateUpload(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    size_bytes: int = Field(gt=0)
    rights_confirmed: bool


class UploadSession(BaseModel):
    project_id: str
    chunk_size: int
    total_chunks: int
    received_chunks: list[int]


class JobRead(BaseModel):
    id: str
    project_id: str
    type: JobType
    status: JobStatus
    progress: float
    message: str | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    download_url: str | None = None

    @classmethod
    def of(cls, job: Job) -> "JobRead":
        data = cls.model_validate(job, from_attributes=True)
        if job.result_key and job.status == JobStatus.SUCCEEDED:
            data.download_url = f"/api/jobs/{job.id}/download"
        return data


class ProjectRead(BaseModel):
    id: str
    filename: str
    size_bytes: int
    status: ProjectStatus
    error: str | None
    created_at: datetime
    expires_at: datetime
    rights_confirmed_at: datetime
    duration: float | None
    width: int | None
    height: int | None
    fps: float | None
    has_audio: bool | None
    source_url: str | None = None
    source_title: str | None = None
    source_channel: str | None = None
    source_channel_url: str | None = None
    jobs: list[JobRead] = []

    @classmethod
    def of(cls, project: Project, jobs: list[Job] | None = None) -> "ProjectRead":
        data = cls.model_validate(project, from_attributes=True)
        data.jobs = [JobRead.of(j) for j in jobs or []]
        return data


class ProjectSummary(BaseModel):
    id: str
    filename: str
    status: ProjectStatus
    created_at: datetime
    expires_at: datetime
    duration: float | None
    clip_count: int


class CompleteUploadResponse(BaseModel):
    project: ProjectRead
    job: JobRead


class TextOverlay(BaseModel):
    """A text placed on the video in the clip editor."""
    id: str = Field(min_length=1, max_length=40)
    text: str = Field(max_length=300)
    x: float = Field(ge=0, le=1)       # centre, as a fraction of the frame width
    y: float = Field(ge=0, le=1)       # centre, as a fraction of the frame height
    size: float = Field(ge=0.02, le=0.3)  # font em as a fraction of the frame width
    font: Literal["montserrat", "poppins", "anton", "bebas"] = "montserrat"
    color: str = Field(default="#FFFFFF", pattern=r"^#[0-9A-Fa-f]{6}$")
    style: Literal["outline", "box", "plain"] = "outline"
    start: float = Field(default=0, ge=0)    # seconds from the clip's start
    end: float | None = Field(default=None, ge=0)  # None = until the clip ends

    @model_validator(mode="after")
    def _end_after_start(self) -> "TextOverlay":
        if self.end is not None and self.end <= self.start:
            raise ValueError("a text must end after it starts")
        return self


class OverlaysRequest(BaseModel):
    overlays: list[TextOverlay] = Field(default_factory=list, max_length=30)


class ClipWord(BaseModel):
    start: float
    end: float
    text: str           # as shown in captions (after fixes; "" = hidden)
    original: str       # as transcribed


class WordFix(BaseModel):
    start: float                          # the word's start time, identifies it
    text: str = Field(max_length=60)      # "" hides the word in captions


class CorrectionsRequest(BaseModel):
    fixes: list[WordFix] = Field(max_length=2000)


class ClipRead(BaseModel):
    id: str
    project_id: str
    source: ClipSource
    index: int
    start: float
    end: float
    duration: float
    text: str
    title: str | None
    hook: str | None
    score: float | None
    reason: str | None
    suggested_start: float | None
    suggested_end: float | None
    thumbnail_url: str
    overlays: list[TextOverlay] = []

    @classmethod
    def of(cls, clip: Clip) -> "ClipRead":
        return cls(
            id=clip.id, project_id=clip.project_id, source=clip.source, index=clip.index,
            start=clip.start, end=clip.end, duration=round(clip.duration, 3), text=clip.text,
            title=clip.title, hook=clip.hook, score=clip.score, reason=clip.reason,
            suggested_start=clip.suggested_start, suggested_end=clip.suggested_end,
            # The start time in the URL busts the browser cache after a trim.
            thumbnail_url=f"/api/clips/{clip.id}/thumbnail?t={int(clip.start * 1000)}",
            overlays=_overlays(clip.overlays),
        )


def _overlays(raw: str | None) -> list["TextOverlay"]:
    try:
        items = json.loads(raw or "[]")
    except ValueError:
        return []
    out = []
    for item in items if isinstance(items, list) else []:
        try:
            out.append(TextOverlay.model_validate(item))
        except ValueError:
            continue
    return out


class SimpleClipsRequest(BaseModel):
    target_seconds: float = Field(ge=15, le=180)


class AiClipsRequest(BaseModel):
    # Aim for 20-45 s moments whose ending loops back into the start (optional style).
    short: bool = False
    # Optional: what kind of moments to look for, e.g. "funny moments" or "money tips".
    focus: str | None = Field(default=None, max_length=300)


class TitleRequest(BaseModel):
    title: str = Field(max_length=100)


class TrimRequest(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)


class ExportRequest(BaseModel):
    settings: ExportSettings = ExportSettings()


class ZipExportRequest(BaseModel):
    source: ClipSource = ClipSource.SIMPLE
    clip_ids: list[str] | None = None  # None = every clip of `source`
    settings: ExportSettings = ExportSettings()

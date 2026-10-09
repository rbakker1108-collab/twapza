"""Database models. All datetimes are timezone-aware UTC."""

import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return uuid.uuid4().hex


class ProjectStatus(StrEnum):
    UPLOADING = "uploading"
    QUEUED = "queued"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class JobType(StrEnum):
    INGEST = "ingest"
    TRANSCRIBE = "transcribe"
    SIMPLE_CLIPS = "simple_clips"
    EXPORT = "export"
    EXPORT_ZIP = "export_zip"
    AI_CLIPS = "ai_clips"


class ClipSource(StrEnum):
    SIMPLE = "simple"
    AI = "ai"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"

    @property
    def is_terminal(self) -> bool:
        return self in (JobStatus.SUCCEEDED, JobStatus.FAILED)


class Project(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    filename: str
    ext: str
    size_bytes: int
    chunk_size: int
    total_chunks: int
    status: ProjectStatus = ProjectStatus.UPLOADING
    rights_confirmed_at: datetime
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime = Field(index=True)
    error: str | None = None

    # Filled in by the ingest job
    duration: float | None = None
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    video_codec: str | None = None
    audio_codec: str | None = None
    has_audio: bool | None = None

    @property
    def prefix(self) -> str:
        return f"projects/{self.id}/"

    @property
    def original_key(self) -> str:
        return f"{self.prefix}original.{self.ext}"

    @property
    def proxy_key(self) -> str:
        return f"{self.prefix}proxy.mp4"

    @property
    def audio_key(self) -> str:
        return f"{self.prefix}audio.wav"

    @property
    def transcript_key(self) -> str:
        return f"{self.prefix}transcript.json"

    @property
    def scenes_key(self) -> str:
        return f"{self.prefix}scenes.json"

    @property
    def stem(self) -> str:
        """Filename without extension, for naming downloads."""
        return self.filename.rsplit(".", 1)[0] or "video"


class UploadPart(SQLModel, table=True):
    project_id: str = Field(foreign_key="project.id", primary_key=True)
    index: int = Field(primary_key=True)
    size: int


class Job(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    type: JobType
    status: JobStatus = JobStatus.QUEUED
    progress: float = 0.0
    message: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    # Jobs that produce a downloadable file (exports, ZIPs)
    result_key: str | None = None
    result_name: str | None = None


class Clip(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    source: ClipSource
    index: int
    start: float
    end: float
    text: str = ""
    # AI highlight fields (Stage 3)
    title: str | None = None
    hook: str | None = None
    score: float | None = None
    reason: str | None = None
    # Where the clip was originally suggested, so a trim can be undone
    suggested_start: float | None = None
    suggested_end: float | None = None
    created_at: datetime = Field(default_factory=utcnow)

    @property
    def duration(self) -> float:
        return self.end - self.start

    @property
    def thumbs_prefix(self) -> str:
        return f"projects/{self.project_id}/thumbs/{self.id}/"

    @property
    def thumbnail_key(self) -> str:
        # Named by start time so a trimmed clip gets a fresh thumbnail (and URL).
        return f"{self.thumbs_prefix}{int(self.start * 1000)}.jpg"

    @property
    def thumbnail_at(self) -> float:
        return self.start + min(1.0, self.duration / 2)

    @property
    def exports_prefix(self) -> str:
        return f"projects/{self.project_id}/exports/{self.id}/"

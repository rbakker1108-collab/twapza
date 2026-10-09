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

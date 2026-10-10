from datetime import datetime

from pydantic import BaseModel, Field

from twapza.exports import ExportSettings

from twapza.db.models import Clip, ClipSource, Job, JobStatus, JobType, Project, ProjectStatus


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

    @classmethod
    def of(cls, clip: Clip) -> "ClipRead":
        return cls(
            id=clip.id, project_id=clip.project_id, source=clip.source, index=clip.index,
            start=clip.start, end=clip.end, duration=round(clip.duration, 3), text=clip.text,
            title=clip.title, hook=clip.hook, score=clip.score, reason=clip.reason,
            suggested_start=clip.suggested_start, suggested_end=clip.suggested_end,
            # The start time in the URL busts the browser cache after a trim.
            thumbnail_url=f"/api/clips/{clip.id}/thumbnail?t={int(clip.start * 1000)}",
        )


class SimpleClipsRequest(BaseModel):
    target_seconds: float = Field(ge=15, le=180)


class TrimRequest(BaseModel):
    start: float = Field(ge=0)
    end: float = Field(gt=0)


class ExportRequest(BaseModel):
    settings: ExportSettings = ExportSettings()


class ZipExportRequest(BaseModel):
    source: ClipSource = ClipSource.SIMPLE
    clip_ids: list[str] | None = None  # None = every clip of `source`
    settings: ExportSettings = ExportSettings()

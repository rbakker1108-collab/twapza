from datetime import datetime

from pydantic import BaseModel, Field

from twapza.db.models import Job, JobStatus, JobType, Project, ProjectStatus


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

    @classmethod
    def of(cls, job: Job) -> "JobRead":
        return cls.model_validate(job, from_attributes=True)


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


class CompleteUploadResponse(BaseModel):
    project: ProjectRead
    job: JobRead

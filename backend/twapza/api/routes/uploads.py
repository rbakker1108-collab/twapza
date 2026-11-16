"""Chunked, resumable uploads.

1. ``POST /api/uploads`` (with ``rights_confirmed: true``) creates a project and
   returns the chunk size / count.
2. ``PUT /api/uploads/{id}/chunks/{n}`` uploads each chunk (raw body). Chunks
   are idempotent, so a client can retry or resume.
3. ``GET /api/uploads/{id}`` lists received chunks (for resuming).
4. ``POST /api/uploads/{id}/complete`` finalises the file and starts ingest.
"""

import math
from datetime import timedelta
from pathlib import PurePath

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from rq import Queue
from sqlmodel import Session, select

from twapza.accounts.usage import plan_of, usage_of
from twapza.api.deps import current_user
from twapza.api.schemas import CompleteUploadResponse, CreateUpload, JobRead, ProjectRead, UploadSession
from twapza.config import ALLOWED_EXTENSIONS, Settings, get_settings
from twapza.db.models import JobType, Project, ProjectStatus, UploadPart, User, utcnow
from twapza.db.session import get_session
from twapza.queue import enqueue_job, get_queue, with_priority
from twapza.storage import Storage, get_storage
from twapza.workers.tasks import ingest_project

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

RIGHTS_REQUIRED = "Please confirm that you own this video or have permission to use it."


def require_minutes_left(session: Session, user: User) -> None:
    """Refuse new videos once this month's minutes are used up (the exact check runs at ingest)."""
    usage = usage_of(session, user)
    if usage.remaining_seconds < 1:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"You've used all {plan_of(user).minutes} video minutes of this month. Upgrade on your "
            f"account page, or wait until {usage.period_end:%Y-%m-%d}.")


def _received(session: Session, project_id: str) -> list[int]:
    rows = session.exec(
        select(UploadPart.index).where(UploadPart.project_id == project_id).order_by(UploadPart.index)
    ).all()
    return list(rows)


def _get_uploading(session: Session, project_id: str, user: User) -> Project:
    project = session.get(Project, project_id)
    if project is None or project.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload not found.")
    if project.status != ProjectStatus.UPLOADING:
        raise HTTPException(status.HTTP_409_CONFLICT, "Upload is already complete.")
    return project


@router.post("", response_model=UploadSession, status_code=status.HTTP_201_CREATED)
def create_upload(
    body: CreateUpload,
    session: Session = Depends(get_session),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
    user: User = Depends(current_user),
) -> UploadSession:
    if not body.rights_confirmed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, RIGHTS_REQUIRED)
    require_minutes_left(session, user)

    filename = PurePath(body.filename.replace("\\", "/")).name
    ext = PurePath(filename).suffix.lower().lstrip(".")
    if ext not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(f".{e}" for e in ALLOWED_EXTENSIONS)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Unsupported file type. Allowed: {allowed}.")
    if body.size_bytes > settings.max_upload_bytes:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"File is too large. The limit is {settings.max_upload_gb:g} GB.",
        )

    now = utcnow()
    chunk_size = settings.chunk_size_bytes
    project = Project(
        user_id=user.id,
        filename=filename,
        ext=ext,
        size_bytes=body.size_bytes,
        chunk_size=chunk_size,
        total_chunks=math.ceil(body.size_bytes / chunk_size),
        rights_confirmed_at=now,
        created_at=now,
        expires_at=now + timedelta(hours=settings.retention_hours),
    )
    storage.begin_upload(project.original_key, body.size_bytes)
    session.add(project)
    session.commit()
    return UploadSession(
        project_id=project.id, chunk_size=chunk_size,
        total_chunks=project.total_chunks, received_chunks=[],
    )


@router.get("/{project_id}", response_model=UploadSession)
def get_upload(project_id: str, session: Session = Depends(get_session),
               user: User = Depends(current_user)) -> UploadSession:
    project = _get_uploading(session, project_id, user)
    return UploadSession(
        project_id=project.id, chunk_size=project.chunk_size,
        total_chunks=project.total_chunks, received_chunks=_received(session, project.id),
    )


@router.put("/{project_id}/chunks/{index}", status_code=status.HTTP_204_NO_CONTENT)
async def put_chunk(
    project_id: str,
    index: int,
    request: Request,
    session: Session = Depends(get_session),
    storage: Storage = Depends(get_storage),
    user: User = Depends(current_user),
) -> None:
    project = _get_uploading(session, project_id, user)
    if not 0 <= index < project.total_chunks:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chunk index out of range.")
    offset = index * project.chunk_size
    expected = min(project.chunk_size, project.size_bytes - offset)

    buf = bytearray()
    async for piece in request.stream():
        buf.extend(piece)
        if len(buf) > expected:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Chunk is larger than expected.")
    if len(buf) != expected:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Chunk has {len(buf)} bytes, expected {expected}."
        )

    await run_in_threadpool(storage.write_part, project.original_key, offset, bytes(buf))
    session.merge(UploadPart(project_id=project.id, index=index, size=expected))
    session.commit()


@router.post("/{project_id}/complete", response_model=CompleteUploadResponse)
def complete_upload(
    project_id: str,
    session: Session = Depends(get_session),
    storage: Storage = Depends(get_storage),
    queue: Queue = Depends(get_queue),
    user: User = Depends(current_user),
) -> CompleteUploadResponse:
    project = _get_uploading(session, project_id, user)
    received = _received(session, project.id)
    if len(received) != project.total_chunks:
        missing = sorted(set(range(project.total_chunks)) - set(received))
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"message": "Upload is incomplete.", "missing_chunks": missing[:100]},
        )

    storage.complete_upload(project.original_key)
    project.status = ProjectStatus.QUEUED
    session.add(project)
    session.commit()

    job = enqueue_job(
        session, with_priority(queue, plan_of(user).priority), project_id=project.id, job_type=JobType.INGEST, func=ingest_project,
    )
    session.refresh(project)
    return CompleteUploadResponse(project=ProjectRead.of(project, [job]), job=JobRead.of(job))

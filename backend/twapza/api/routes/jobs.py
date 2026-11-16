import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response, StreamingResponse
from rq import Queue
from sqlmodel import Session

from twapza.api.deps import current_user
from twapza.api.schemas import JobRead
from twapza.api.routes.projects import serve_object
from twapza.db.models import Job, JobStatus, JobType, Project, User
from twapza.db.session import get_engine, get_session
from twapza.queue import cancel_job, get_queue
from twapza.storage import Storage, get_storage

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

POLL_INTERVAL = 0.5
KEEPALIVE_INTERVAL = 15.0


def _owned_job(session: Session, job_id: str, user: User) -> Job:
    job = session.get(Job, job_id)
    project = session.get(Project, job.project_id) if job else None
    if job is None or project is None or project.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found.")
    return job


def _load(job_id: str) -> JobRead | None:
    with Session(get_engine()) as session:
        job = session.get(Job, job_id)
        return JobRead.of(job) if job else None


@router.get("/{job_id}", response_model=JobRead)
def get_job(job_id: str, session: Session = Depends(get_session),
            user: User = Depends(current_user)) -> JobRead:
    job = _owned_job(session, job_id, user)
    return JobRead.of(job)


@router.post("/{job_id}/cancel", response_model=JobRead)
def cancel(job_id: str, session: Session = Depends(get_session),
           queue: Queue = Depends(get_queue), user: User = Depends(current_user)) -> JobRead:
    """Stop a queued or running job. It stops at its next progress update."""
    job = _owned_job(session, job_id, user)
    if job.type == JobType.INGEST:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Processing an upload can't be canceled; delete the project instead.")
    if job.status.is_terminal:
        raise HTTPException(status.HTTP_409_CONFLICT, "This job has already finished.")
    return JobRead.of(cancel_job(session, job, queue))


@router.get("/{job_id}/download")
def download_job_result(
    job_id: str,
    session: Session = Depends(get_session),
    storage: Storage = Depends(get_storage),
    user: User = Depends(current_user),
) -> Response:
    job = _owned_job(session, job_id, user)
    if not job.result_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nothing to download.")
    if job.status != JobStatus.SUCCEEDED:
        raise HTTPException(status.HTTP_409_CONFLICT, "The file is not ready yet.")
    media_type = "application/zip" if job.result_key.endswith(".zip") else "video/mp4"
    return serve_object(storage, job.result_key, media_type, download_name=job.result_name)


@router.get("/{job_id}/events")
def job_events(job_id: str, request: Request, session: Session = Depends(get_session),
               user: User = Depends(current_user)) -> StreamingResponse:
    """Server-Sent Events stream of job updates; closes when the job finishes."""
    _owned_job(session, job_id, user)

    async def stream() -> AsyncIterator[str]:
        last_payload = None
        idle = 0.0
        while not await request.is_disconnected():
            job = await asyncio.to_thread(_load, job_id)
            if job is None:
                yield "event: gone\ndata: {}\n\n"
                return
            payload = job.model_dump_json()
            if payload != last_payload:
                last_payload = payload
                idle = 0.0
                yield f"data: {payload}\n\n"
                if job.status.is_terminal:
                    return
            elif idle >= KEEPALIVE_INTERVAL:
                idle = 0.0
                yield ": keepalive\n\n"
            await asyncio.sleep(POLL_INTERVAL)
            idle += POLL_INTERVAL

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


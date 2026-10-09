import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session

from twapza.api.schemas import JobRead
from twapza.db.models import Job
from twapza.db.session import get_engine, get_session

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

POLL_INTERVAL = 0.5
KEEPALIVE_INTERVAL = 15.0


def _load(job_id: str) -> JobRead | None:
    with Session(get_engine()) as session:
        job = session.get(Job, job_id)
        return JobRead.of(job) if job else None


@router.get("/{job_id}", response_model=JobRead)
def get_job(job_id: str, session: Session = Depends(get_session)) -> JobRead:
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found.")
    return JobRead.of(job)


@router.get("/{job_id}/events")
async def job_events(job_id: str, request: Request) -> StreamingResponse:
    """Server-Sent Events stream of job updates; closes when the job finishes."""
    if await asyncio.to_thread(_load, job_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found.")

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


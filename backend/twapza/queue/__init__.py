"""Job queue (Redis + RQ) and progress reporting.

The database ``Job`` row is the source of truth for job state/progress; RQ is
only the transport that gets work to a worker. The API streams progress to the
browser by watching the ``Job`` row (see ``api/routes/jobs.py``).
"""

import logging
import time
from collections.abc import Callable
from functools import lru_cache

from redis import Redis
from rq import Queue
from sqlmodel import Session

from twapza.config import get_settings
from twapza.db.models import Job, JobStatus, JobType, utcnow
from twapza.db.session import get_engine

log = logging.getLogger(__name__)


@lru_cache
def get_redis() -> Redis:
    return Redis.from_url(get_settings().redis_url)


def get_queue() -> Queue:
    """FastAPI dependency; overridden in tests with a synchronous queue."""
    settings = get_settings()
    return Queue(settings.queue_name, connection=get_redis())


def enqueue_job(
    session: Session,
    queue: Queue,
    *,
    project_id: str,
    job_type: JobType,
    func: Callable[..., None],
    **kwargs,
) -> Job:
    """Create a ``Job`` row and hand it to RQ. ``func`` is called as ``func(job_id, project_id, **kwargs)``."""
    job = Job(project_id=project_id, type=job_type)
    session.add(job)
    session.commit()
    session.refresh(job)
    queue.enqueue(
        func, job.id, project_id, **kwargs,
        job_id=job.id,
        job_timeout=get_settings().job_timeout_seconds,
        result_ttl=3600,
        failure_ttl=24 * 3600,
    )
    session.refresh(job)
    return job


class ProgressReporter:
    """Writes job progress to the database, throttled to avoid write storms.

    Progress is expressed in percent (0-100). ``stage(start, end)`` returns a
    callback mapping a sub-task's 0..1 fraction onto ``[start, end]`` percent.
    """

    def __init__(self, job_id: str, min_interval: float = 0.5):
        self.job_id = job_id
        self.min_interval = min_interval
        self._last_write = 0.0
        self._last_progress = -1.0
        self._message: str | None = None

    def update(self, progress: float, message: str | None = None, *, force: bool = False) -> None:
        progress = max(0.0, min(100.0, round(progress, 1)))
        message_changed = message is not None and message != self._message
        now = time.monotonic()
        if not (force or message_changed) and (
            progress == self._last_progress or now - self._last_write < self.min_interval
        ):
            return
        with Session(get_engine()) as session:
            job = session.get(Job, self.job_id)
            if job is None:
                return
            job.progress = progress
            if message is not None:
                job.message = message
                self._message = message
            session.add(job)
            session.commit()
        self._last_write = now
        self._last_progress = progress

    def stage(self, start: float, end: float, message: str | None = None) -> Callable[[float], None]:
        if message:
            self.update(start, message, force=True)
        return lambda fraction: self.update(start + (end - start) * fraction)


def run_tracked(job_id: str, body: Callable[[ProgressReporter], None]) -> bool:
    """Run ``body`` with job bookkeeping. Returns True on success.

    Failures are recorded on the Job row (with a user-facing message) rather
    than re-raised, so the database stays the single source of truth.
    """
    with Session(get_engine()) as session:
        job = session.get(Job, job_id)
        if job is None:
            log.warning("job %s vanished before it started", job_id)
            return False
        job.status = JobStatus.RUNNING
        job.started_at = utcnow()
        session.add(job)
        session.commit()

    reporter = ProgressReporter(job_id)
    error: str | None = None
    try:
        body(reporter)
    except Exception as exc:  # noqa: BLE001 - we record every failure
        log.exception("job %s failed", job_id)
        error = str(exc) or exc.__class__.__name__

    with Session(get_engine()) as session:
        job = session.get(Job, job_id)
        if job is None:
            return False
        job.finished_at = utcnow()
        if error is None:
            job.status = JobStatus.SUCCEEDED
            job.progress = 100.0
            job.message = "Done"
        else:
            job.status = JobStatus.FAILED
            job.error = error
        session.add(job)
        session.commit()
    return error is None

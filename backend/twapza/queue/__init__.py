"""Job queue (Redis + RQ) and progress reporting.

The database ``Job`` row is the source of truth for job state/progress; RQ is
only the transport that gets work to a worker. The API streams progress to the
browser by watching the ``Job`` row (see ``api/routes/jobs.py``).
"""

import errno
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime
from functools import lru_cache

from redis import Redis
from rq import Queue
from rq.job import Job as RQJob
from sqlmodel import Session, select

from twapza.config import get_settings
from twapza.db.models import Job, JobStatus, JobType, Project, ProjectStatus, utcnow
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
    result_key: str | None = None,
    result_name: str | None = None,
    **kwargs,
) -> Job:
    """Create a ``Job`` row and hand it to RQ. ``func`` is called as ``func(job_id, project_id, **kwargs)``."""
    job = Job(project_id=project_id, type=job_type, result_key=result_key, result_name=result_name)
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


def completed_job(
    session: Session, *, project_id: str, job_type: JobType, result_key: str, result_name: str,
) -> Job:
    """Record an already-finished job, e.g. when an export is served from cache."""
    now = utcnow()
    job = Job(project_id=project_id, type=job_type, status=JobStatus.SUCCEEDED, progress=100.0,
              message="Done", result_key=result_key, result_name=result_name,
              started_at=now, finished_at=now)
    session.add(job)
    session.commit()
    session.refresh(job)
    return job


class JobCanceled(Exception):
    """Raised inside a running job when the user has canceled it."""


def user_message(exc: BaseException) -> str:
    """A message for the person using Twapza, from any exception a job raised."""
    if isinstance(exc, OSError) and exc.errno == errno.ENOSPC:
        return "The server ran out of disk space. Delete some projects and try again."
    text = str(exc).strip()
    # Our own error types already carry readable messages.
    if exc.__class__.__name__ in {"MediaError", "TaskError", "HighlightError", "StorageError"}:
        return text or "Processing failed."
    return f"Something went wrong: {text or exc.__class__.__name__}"


class ProgressReporter:
    """Writes job progress to the database, throttled to avoid write storms.

    Progress is expressed in percent (0-100). ``stage(start, end)`` returns a
    callback mapping a sub-task's 0..1 fraction onto ``[start, end]`` percent.
    Every write also checks whether the job was canceled and, if so, raises
    ``JobCanceled`` so the work stops at the next progress update.
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
            # Deleted (its project was deleted) or canceled: stop working on it.
            if job is None or job.status == JobStatus.CANCELED:
                raise JobCanceled()
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
    than re-raised, so the database stays the single source of truth. A job
    canceled before it starts is skipped; one canceled while running stops at
    its next progress update and stays ``canceled``.
    """
    with Session(get_engine()) as session:
        job = session.get(Job, job_id)
        if job is None:
            log.warning("job %s vanished before it started", job_id)
            return False
        if job.status == JobStatus.CANCELED:
            return False
        job.status = JobStatus.RUNNING
        job.started_at = utcnow()
        session.add(job)
        session.commit()

    reporter = ProgressReporter(job_id)
    error: str | None = None
    canceled = False
    try:
        body(reporter)
    except JobCanceled:
        canceled = True
        log.info("job %s canceled", job_id)
    except Exception as exc:  # noqa: BLE001 - we record every failure
        log.exception("job %s failed", job_id)
        error = user_message(exc)

    with Session(get_engine()) as session:
        job = session.get(Job, job_id)
        if job is None:
            return False
        job.finished_at = utcnow()
        if canceled or job.status == JobStatus.CANCELED:
            job.status = JobStatus.CANCELED
            job.message = "Canceled"
        elif error is None:
            job.status = JobStatus.SUCCEEDED
            job.progress = 100.0
            job.message = "Done"
        else:
            job.status = JobStatus.FAILED
            job.error = error
        session.add(job)
        session.commit()
        return job.status == JobStatus.SUCCEEDED


def cancel_job(session: Session, job: Job, queue: Queue | None = None) -> Job:
    """Mark a job canceled; a queued job is also removed from the RQ queue."""
    if job.status.is_terminal:
        return job
    job.status = JobStatus.CANCELED
    job.message = "Canceled"
    job.finished_at = utcnow()
    session.add(job)
    session.commit()
    if queue is not None:
        try:
            RQJob.fetch(job.id, connection=queue.connection).cancel()
        except Exception:  # noqa: BLE001 - already running/finished: the status check stops it
            pass
    session.refresh(job)
    return job


STALE_HEARTBEAT_SECONDS = 180
MISSING_GRACE_SECONDS = 120
LOST_WORKER_MESSAGE = "Twapza stopped while this was running (for example after a restart). Please try again."


def _aware(dt: datetime | None) -> datetime | None:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def reap_stale_jobs(connection, now: datetime | None = None) -> int:
    """Fail jobs whose worker died or that vanished from Redis. Returns how many.

    - not in Redis any more (e.g. Redis restarted) and older than a grace period
    - RQ says failed / stopped / canceled (worker crash, timeout)
    - RQ says started but the job's heartbeat stopped (worker killed)
    """
    from rq.exceptions import NoSuchJobError
    from rq.job import JobStatus as RQStatus

    now = now or utcnow()
    reaped = 0
    with Session(get_engine()) as session:
        active = session.exec(select(Job).where(
            Job.status.in_([JobStatus.QUEUED, JobStatus.RUNNING]))).all()
        for job in active:
            stale = False
            try:
                rq_job = RQJob.fetch(job.id, connection=connection)
                status = rq_job.get_status(refresh=False)
                heartbeat = _aware(rq_job.last_heartbeat)
                if status in (RQStatus.FAILED, RQStatus.STOPPED, RQStatus.CANCELED):
                    stale = True
                elif status == RQStatus.STARTED and heartbeat is not None:
                    stale = (now - heartbeat).total_seconds() > STALE_HEARTBEAT_SECONDS
            except NoSuchJobError:
                stale = (now - _aware(job.created_at)).total_seconds() > MISSING_GRACE_SECONDS
            if not stale:
                continue
            job.status = JobStatus.FAILED
            job.error = LOST_WORKER_MESSAGE
            job.finished_at = now
            session.add(job)
            if job.type == JobType.INGEST:
                project = session.get(Project, job.project_id)
                if project is not None and project.status != ProjectStatus.READY:
                    project.status = ProjectStatus.FAILED
                    project.error = LOST_WORKER_MESSAGE
                    session.add(project)
            reaped += 1
        session.commit()
    if reaped:
        log.warning("marked %d stale job(s) as failed", reaped)
    return reaped

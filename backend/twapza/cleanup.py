"""Retention: delete projects (files + rows) once they pass ``expires_at``.

Run once with ``python -m twapza.cleanup --once`` or as a loop (the
``twapza-scheduler`` service).
"""

import argparse
import logging
import time
from datetime import datetime

from sqlmodel import Session, delete, select

from twapza.config import get_settings
from twapza.db.models import Clip, Job, Project, UploadPart, utcnow
from twapza.db.session import get_engine, init_db
from twapza.storage import Storage, get_storage

log = logging.getLogger(__name__)


def delete_project(session: Session, storage: Storage, project: Project) -> None:
    storage.delete_prefix(project.prefix)
    session.exec(delete(UploadPart).where(UploadPart.project_id == project.id))
    session.exec(delete(Job).where(Job.project_id == project.id))
    session.exec(delete(Clip).where(Clip.project_id == project.id))
    session.delete(project)


def cleanup_expired(now: datetime | None = None) -> int:
    """Delete every expired project. Returns how many were removed."""
    now = now or utcnow()
    storage = get_storage()
    removed = 0
    with Session(get_engine()) as session:
        expired = session.exec(select(Project).where(Project.expires_at <= now)).all()
        for project in expired:
            try:
                delete_project(session, storage, project)
                session.commit()
                removed += 1
            except Exception:  # noqa: BLE001 - keep going with the rest
                session.rollback()
                log.exception("failed to delete expired project %s", project.id)
    if removed:
        log.info("cleanup removed %d expired project(s)", removed)
    return removed


ORPHAN_GRACE_SECONDS = 3600


def sweep_orphans(now: datetime | None = None) -> int:
    """Delete project folders that have no database row (e.g. after a crash or reset).

    Only folders untouched for an hour are removed, so an upload being created
    right now is never affected. Returns how many folders were removed.
    """
    now = now or utcnow()
    storage = get_storage()
    with Session(get_engine()) as session:
        known = set(session.exec(select(Project.id)).all())
    removed = 0
    for name, mtime in storage.list_children("projects/"):
        if name in known or now.timestamp() - mtime < ORPHAN_GRACE_SECONDS:
            continue
        storage.delete_prefix(f"projects/{name}/")
        removed += 1
    if removed:
        log.info("cleanup removed %d orphaned project folder(s)", removed)
    return removed


def run_maintenance(now: datetime | None = None) -> None:
    """One cleanup pass: expired projects, orphaned files."""
    cleanup_expired(now)
    sweep_orphans(now)


REAP_INTERVAL_SECONDS = 60


def main() -> None:
    parser = argparse.ArgumentParser(description="Twapza retention cleanup and job watchdog")
    parser.add_argument("--once", action="store_true", help="run a single pass and exit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    init_db()
    from twapza.queue import get_redis, reap_stale_jobs

    interval = get_settings().cleanup_interval_seconds
    last_cleanup = 0.0
    while True:
        try:
            reap_stale_jobs(get_redis())
        except Exception:  # noqa: BLE001 - Redis briefly unavailable etc.; try again next loop
            log.exception("job watchdog failed")
        if args.once or time.monotonic() - last_cleanup >= interval:
            run_maintenance()
            last_cleanup = time.monotonic()
        if args.once:
            return
        time.sleep(REAP_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()

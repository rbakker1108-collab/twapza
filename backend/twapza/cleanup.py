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


def main() -> None:
    parser = argparse.ArgumentParser(description="Twapza retention cleanup")
    parser.add_argument("--once", action="store_true", help="run a single pass and exit")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    init_db()
    interval = get_settings().cleanup_interval_seconds
    while True:
        cleanup_expired()
        if args.once:
            return
        time.sleep(interval)


if __name__ == "__main__":
    main()

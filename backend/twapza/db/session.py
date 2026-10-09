import fcntl
import logging
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path

from sqlalchemy import event, text
from sqlalchemy.engine import Engine
from sqlmodel import Session, SQLModel, create_engine

from twapza.config import get_settings

log = logging.getLogger(__name__)

# Bump whenever a table changes. There are no migrations yet: all data is
# temporary (24h retention), so on a version mismatch the database and stored
# project files are reset. Replace with Alembic before real deployments.
SCHEMA_VERSION = 2


def _sqlite_path(url: str) -> Path | None:
    if not url.startswith("sqlite"):
        return None
    db_path = url.removeprefix("sqlite:///")
    return Path(db_path) if db_path and db_path != ":memory:" else None


@lru_cache
def get_engine() -> Engine:
    url = get_settings().database_url
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args = {"check_same_thread": False, "timeout": 30}
        if path := _sqlite_path(url):
            path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(url, connect_args=connect_args)

    if url.startswith("sqlite"):
        # WAL lets the API read while the worker writes progress updates.
        @event.listens_for(engine, "connect")
        def _sqlite_pragmas(dbapi_conn, _record):  # pragma: no cover - trivial
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA busy_timeout=30000")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()

    return engine


@contextmanager
def _init_lock() -> Iterator[None]:
    """Serialise init_db across the api/worker/scheduler processes."""
    path = _sqlite_path(get_settings().database_url)
    if path is None:
        yield
        return
    with open(path.with_name(path.name + ".lock"), "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def init_db() -> None:
    # Import models so they are registered on the metadata.
    from twapza.db import models  # noqa: F401

    engine = get_engine()
    with _init_lock():
        if engine.dialect.name == "sqlite":
            with engine.connect() as conn:
                version = conn.execute(text("PRAGMA user_version")).scalar() or 0
                has_tables = bool(conn.execute(
                    text("SELECT 1 FROM sqlite_master WHERE type='table' LIMIT 1")
                ).first())
            if has_tables and version != SCHEMA_VERSION:
                log.warning("database schema v%s != v%s: resetting temporary data", version, SCHEMA_VERSION)
                from twapza.storage import get_storage

                SQLModel.metadata.drop_all(engine)
                get_storage().delete_prefix("projects/")
            SQLModel.metadata.create_all(engine)
            with engine.begin() as conn:
                conn.execute(text(f"PRAGMA user_version = {SCHEMA_VERSION}"))
        else:
            SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency."""
    with Session(get_engine()) as session:
        yield session

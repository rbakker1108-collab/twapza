"""FastAPI application: ``uvicorn twapza.api.app:app``."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI

from twapza.api.routes import jobs, projects, uploads
from twapza.config import ALLOWED_EXTENSIONS, get_settings
from twapza.db.session import init_db


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Twapza API", version="0.1.0", lifespan=lifespan)
    app.include_router(uploads.router)
    app.include_router(projects.router)
    app.include_router(jobs.router)

    @app.get("/api/health", tags=["meta"])
    def health() -> dict:
        return {"status": "ok"}

    @app.get("/api/config", tags=["meta"])
    def public_config() -> dict:
        """Limits the frontend needs to validate before uploading."""
        s = get_settings()
        return {
            "max_upload_bytes": s.max_upload_bytes,
            "max_duration_seconds": s.max_duration_seconds,
            "allowed_extensions": list(ALLOWED_EXTENSIONS),
            "retention_hours": s.retention_hours,
        }

    return app


app = create_app()

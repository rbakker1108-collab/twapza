"""FastAPI application: ``uvicorn twapza.api.app:app``."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.staticfiles import StaticFiles

from twapza.api.routes import auth, billing, clips, imports, jobs, projects, uploads, waitlist
from twapza.captions.style import FONTS_DIR
from twapza.config import ALLOWED_EXTENSIONS, get_settings
from twapza.db.session import get_engine, init_db
from twapza.monitoring import init_sentry


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logging.basicConfig(level=logging.INFO)
    init_sentry("api")
    init_db()
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Twapza API", version="0.1.0", lifespan=lifespan)
    app.include_router(auth.router)
    app.include_router(billing.router)
    app.include_router(uploads.router)
    app.include_router(imports.router)
    app.include_router(waitlist.router)
    app.include_router(projects.router)
    app.include_router(jobs.router)
    app.include_router(clips.router)
    # Caption fonts, so the browser preview uses the same typefaces as the export.
    app.mount("/api/fonts", StaticFiles(directory=FONTS_DIR), name="fonts")

    @app.get("/api/health", tags=["meta"])
    def health(response: Response) -> dict:
        """For uptime monitors: checks the database and Redis too (503 when one is down)."""
        from sqlalchemy import text

        from twapza import queue as jobqueue

        checks = {}
        try:
            with get_engine().connect() as conn:
                conn.execute(text("SELECT 1"))
            checks["database"] = "ok"
        except Exception:  # noqa: BLE001
            checks["database"] = "down"
        try:
            jobqueue.get_redis().ping()
            checks["queue"] = "ok"
        except Exception:  # noqa: BLE001
            checks["queue"] = "down"
        ok = all(v == "ok" for v in checks.values())
        if not ok:
            response.status_code = 503
        return {"status": "ok" if ok else "degraded", **checks}

    @app.get("/api/config", tags=["meta"])
    def public_config() -> dict:
        """Limits the frontend needs to validate before uploading."""
        s = get_settings()
        return {
            "max_upload_bytes": s.max_upload_bytes,
            "max_duration_seconds": s.max_duration_seconds,
            "allowed_extensions": list(ALLOWED_EXTENSIONS),
            "retention_hours": s.retention_hours,
            "min_clip_seconds": s.min_clip_seconds,
            "max_clip_seconds": s.max_clip_seconds,
            "ai_enabled": bool(s.anthropic_api_key and s.anthropic_api_key.get_secret_value()),
            "claude_model": s.claude_model,
            "youtube_enabled": s.youtube_enabled,
            "billing_enabled": s.billing_enabled,
            "billing_plans": sorted(f"{plan}_{period}" for plan, period in s.prices),
        }

    return app


app = create_app()

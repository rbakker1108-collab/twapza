# CLAUDE.md: Twapza

Twapza helps content creators repurpose **their own** long-form videos (mp4/mov/mkv,
up to ~3 h) into short clips: simple fixed-length clipping snapped to sentence
boundaries, and AI "highlight" clipping using a transcript + the Claude API.

## Product rules (do not violate)

- Input is an **uploaded file only**. Never add downloading from YouTube or other platforms.
- Uploads require the user to confirm they own / have permission to use the content
  (`rights_confirmed: true`, enforced server-side in `api/routes/uploads.py`; the
  confirmation time is stored as `Project.rights_confirmed_at`).
- **Originals are never modified.** Every derived file (proxy, audio, clips) is a new object.
- Everything a project stores is deleted after `TWAPZA_RETENTION_HOURS` (default 24).
- Secrets (e.g. `ANTHROPIC_API_KEY`) come from the environment / `.env`. Never hardcode them.

## Architecture

```
frontend (React/Vite/Tailwind, nginx in Docker)
  │  chunked upload · REST · SSE progress           all under /api
  ▼
twapza-api (FastAPI)  ──  SQLite (metadata)  ──  Storage (local disk; S3 later)
  │ enqueue (RQ)                                     ▲
  ▼                                                  │
twapza-redis  ──►  twapza-worker (RQ: ffmpeg, whisper, Claude)
                   twapza-scheduler (retention cleanup loop)
```

- **The database `Job` row is the source of truth** for job state and progress. RQ is
  only transport. Workers write progress through `queue.ProgressReporter` (throttled);
  `GET /api/jobs/{id}/events` streams changes as Server-Sent Events by watching the row.
- **Task failures are recorded, not raised**: `queue.run_tracked()` marks the job
  failed with a user-facing message. Raise exceptions with messages a user can read
  (e.g. `MediaError("Video is 200 min long; the limit is 180 min.")`).
- **Storage is key-based** (`projects/<id>/original.<ext>`, `proxy.mp4`, `audio.wav`, …).
  Code must go through the `Storage` protocol (`storage/base.py`), never raw paths.
  ffmpeg needs real files, so use `storage.read_path(key)` / `storage.write_path(key)`
  context managers (`write_path` is atomic: temp file, then rename on success).
  All of a project's files live under `Project.prefix` so cleanup is one `delete_prefix`.
- **All media work goes through `media/ffmpeg.py`.** Clips are re-encoded (never
  stream-copied) so cuts land exactly on the snapped timestamps.
- **Uploads are chunked and resumable** (default 16 MB chunks): the server preallocates
  `<key>.part`, writes each chunk at its offset, and renames on `complete`.
  `UploadPart` rows track received chunks; re-sending a chunk is idempotent.
- Previews use a 720p H.264/AAC **proxy** (`proxy.mp4`) because browsers can't play
  mkv or many mov codecs. Served with HTTP Range support for seeking.

## Layout

```
backend/twapza/
  config.py            Settings (pydantic-settings, TWAPZA_* env vars)
  api/app.py           FastAPI app factory; api/routes/{uploads,projects,jobs}.py
  api/schemas.py       Response/request models (keep DB models out of responses)
  db/models.py         SQLModel tables: Project, UploadPart, Job
  db/session.py        Engine (SQLite WAL), init_db(), get_session dependency
  storage/             Storage protocol + LocalStorage
  queue/__init__.py    RQ queue, enqueue_job(), ProgressReporter, run_tracked()
  media/ffmpeg.py      probe / extract_audio / make_proxy / run_ffmpeg (progress parsing)
  workers/tasks.py     RQ entrypoints (take string IDs only)
  workers/__main__.py  `python -m twapza.workers`
  cleanup.py           retention cleanup; `python -m twapza.cleanup [--once]`
backend/tests/         pytest (unit + ffmpeg integration on synthetic media)
frontend/src/
  api/client.ts        typed API client
  lib/upload.ts        chunked upload with retry/resume
  hooks/useJob.ts      SSE job subscription
  components/, pages/  UI (Tailwind)
```

Planned modules for later stages: `transcription/` (Transcriber protocol,
faster-whisper backend), `clipping/` (`snapping.py`, `simple.py`, `llm.py`,
`signals.py`, `dedupe.py`, `highlights.py`), `captions/ass.py`.

## Conventions

- Python ≥ 3.11, type hints everywhere, f-strings, `StrEnum` for statuses.
- Datetimes are timezone-aware UTC (`db.models.utcnow()`).
- Core algorithms (snapping, AI-output parsing, de-duplication, caption generation)
  are **pure functions** with thorough unit tests; I/O lives at the edges.
- RQ task functions take plain string IDs and look everything else up.
- Long-running work reports progress via `ProgressReporter.stage(start, end, message)`.
- API errors: `HTTPException` with a human-readable `detail` string.
- Cached singletons (`get_settings`, `get_engine`, `get_storage`, `get_redis`) are
  `lru_cache`d; tests reset them in `tests/conftest.py`.
- No schema migrations yet: tables are created with `SQLModel.metadata.create_all`.
  Add Alembic before the schema needs to change on a deployed instance.
- Frontend: function components + hooks, Tailwind utility classes, no global state
  library. Keep API types in `api/client.ts` in sync with `api/schemas.py`.
- Naming: the app is **Twapza**; lowercase `twapza` for packages, services, env prefixes.

## Running

With Docker (recommended):

```bash
cp .env.example .env        # add ANTHROPIC_API_KEY when you reach AI highlights
docker compose up --build   # UI: http://localhost:8080 · API docs: http://localhost:8000/docs
```

Without Docker (needs Python 3.11+, Node 22, ffmpeg, redis-server):

```bash
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
redis-server &                                    # or any Redis on REDIS_URL
python -m twapza.workers &                        # worker
uvicorn twapza.api.app:app --reload --port 8000   # API
cd ../frontend && npm install && npm run dev      # UI: http://localhost:5173 (proxies /api)
```

## Testing

```bash
cd backend && python -m pytest -q     # ffmpeg tests auto-skip if ffmpeg is missing
cd frontend && npm test && npm run typecheck
make test                             # both
make test-docker                      # backend tests inside the image
```

Tests use a per-test temp storage dir + SQLite DB and an inline (synchronous) RQ queue
on fakeredis, so no Redis, model download or API key is needed. Synthetic videos are
generated with ffmpeg's `testsrc`/`sine` sources (`tests/conftest.py::make_test_video`).
External services (Whisper, Claude) must be faked behind their protocols in tests.

## Build stages

1. ✅ Skeleton: Compose, chunked upload with rights checkbox, RQ jobs with SSE progress, ingest (probe/audio/proxy), cleanup.
2. Transcription (faster-whisper) + simple clipping with sentence-boundary snapping, downloads + ZIP.
3. AI highlights (Claude), audio-energy/scene refinement, de-duplication, ranked list + trim UI.
4. 9:16 center crop + burned-in word-highlight captions (ASS).
5. Polish: error handling, limits, cleanup verification, README, GPU profile.

# CLAUDE.md: Twapza

Twapza turns creators' **own** long-form YouTube videos (pasted YouTube link, or an uploaded
mp4/mov/mkv, up to ~3 h) into viral vertical Shorts: AI "highlight" clipping using a
transcript + the Claude API, and simple fixed-length clipping snapped to sentence boundaries.

## Product rules (do not violate)

- Input is an **uploaded file** or a **single YouTube video link** (imported with yt-dlp).
  No other platforms, playlists, channels or live streams.
- Both require the user to confirm they own / have permission to use the content
  (`rights_confirmed: true`, enforced server-side in `api/routes/uploads.py` and
  `api/routes/imports.py`; the confirmation time is stored as `Project.rights_confirmed_at`).
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
  failed with a user-facing message (`queue.user_message`). Raise our own error types
  (`MediaError`, `TaskError`, `HighlightError`) with messages a user can read
  (e.g. `MediaError("Video is 200 min long; the limit is 180 min.")`); anything else is
  shown as "Something went wrong: …".
- **Cancellation is cooperative**: `POST /api/jobs/{id}/cancel` sets the row to `canceled`;
  `ProgressReporter.update` raises `JobCanceled` at the job's next progress write, so long
  work must report progress regularly. `run_ffmpeg` kills ffmpeg when its callback raises;
  `ask_for_candidates` stops scheduling Claude calls. Ingest can't be canceled (delete the
  project instead). A deleted job/project also stops work.
- **Job watchdog**: the scheduler runs `queue.reap_stale_jobs` every minute: jobs missing
  from Redis, failed in RQ, or whose RQ heartbeat stopped are marked failed (worker crash or
  restart). Cleanup (`cleanup.run_maintenance`) deletes expired projects and orphaned project
  folders every `TWAPZA_CLEANUP_INTERVAL_SECONDS`.
- **Storage is key-based** (`projects/<id>/original.<ext>`, `proxy.mp4`, `audio.wav`, …).
  Code must go through the `Storage` protocol (`storage/base.py`), never raw paths.
  ffmpeg needs real files, so use `storage.read_path(key)` / `storage.write_path(key)`
  context managers (`write_path` is atomic: temp file, then rename on success).
  All of a project's files live under `Project.prefix` so cleanup is one `delete_prefix`.
- **All media work goes through `media/ffmpeg.py`.** Clips are re-encoded (never
  stream-copied) so cuts land exactly on the snapped timestamps.
- **YouTube import** (`importing/youtube.py`, `POST /api/imports`): the API validates the link
  (`youtube_video_id`; only youtube.com / youtu.be video links) and stores the canonical URL as
  `Project.source_url`; the `import` job (`workers.tasks.import_youtube`) looks up title/length
  (rejects live streams and over-long videos before downloading), downloads ≤ `TWAPZA_YOUTUBE_MAX_HEIGHT`
  as mp4 into `original.mp4`, then queues the normal ingest. yt-dlp errors become readable
  `ImportFailed` messages (`_clean_error`). yt-dlp needs the `[default]` extra + Deno (both pip
  deps) for YouTube; YouTube breaks yt-dlp regularly, so rebuild the image to update it.
  Tests fake `fetch_info`/`download_video`; one test runs real yt-dlp against a local HTTP server.
- **Uploads are chunked and resumable** (default 16 MB chunks): the server preallocates
  `<key>.part`, writes each chunk at its offset, and renames on `complete`.
  `UploadPart` rows track received chunks; re-sending a chunk is idempotent.
- Previews use a 720p H.264/AAC **proxy** (`proxy.mp4`) because browsers can't play
  mkv or many mov codecs. Served with HTTP Range support for seeking. Clip previews
  play a range of the proxy (`ClipPlayer`); nothing is rendered until the user exports.
- **Transcripts** are produced once per project (queued automatically after ingest)
  and cached as `transcript.json`; every clipping feature reuses them via
  `workers.tasks.ensure_transcript`. Videos without audio get an empty transcript.
- **Exports are deterministic and cached**: the key is a hash of the clip's start/end
  plus `ExportSettings` (`exports.py`), so re-exporting an unchanged clip is instant and
  a trimmed clip renders a new file. `ExportSettings.normalized()` drops options that don't
  affect the output before hashing. `exports.video_filter()` picks the ffmpeg filter:
  `aspect="9:16"` → `ffmpeg.vertical_filter(blur|bars|crop)`, always 1080x1920 (whole frame
  scaled to fit over a blurred copy — the default —, whole frame on black bars, or centre crop); otherwise `upscale_1080` (default on) upscales
  sources whose short side is < 1080 px via `ffmpeg.upscale_filter` (lanczos + light
  sharpen; output size computed by ffmpeg so rotated phone videos stay correct). Jobs that produce a file store `result_key` /
  `result_name`; the browser downloads via `GET /api/jobs/{id}/download`.
- **AI highlights** (`clipping/highlights.py`): transcript → sentence lines → ~8 min chunks
  with 60 s overlap (`clipping/llm.py`) → Claude (`ClaudeHighlighter`, default
  `claude-sonnet-5-5`, JSON-schema structured output via `output_config.format`, adaptive
  thinking at `TWAPZA_CLAUDE_EFFORT`, streamed, cached system prompt, server-side refusal
  `fallbacks: "default"`) → `parse_highlights` (tolerant; never raises) → `refine` (snap edges
  to sentence boundaries, align start to a nearby PySceneDetect cut, blend 80% model score +
  20% loudness score) → `dedupe` (greedy NMS on IoU/containment) → top `TWAPZA_MAX_HIGHLIGHTS`.
  Scene cuts are cached in `scenes.json`; scene detection failing never fails the job.
  Forced `tool_choice` is not allowed on Sonnet 5.5; keep using structured outputs.
- **Subtitles**: captions are on by default in the UI (`DEFAULT_EXPORT`). Besides burning them in,
  `GET /api/clips/{id}/subtitles.srt` returns a sidecar SRT (`captions/srt.py::build_srt`, same
  word grouping as the ASS captions) for uploading to YouTube/TikTok.
- **Captions** (`captions/`): `ExportSettings.captions` (`CaptionSettings`: font, colours,
  size, position, words per line, uppercase) → `captions/ass.py::build_ass` (pure: words in the
  clip range, rebased to 0, grouped into pages of N words broken at sentence ends/pauses; one
  ASS event per spoken word re-draws the page with that word in the highlight colour) → burned by
  `ffmpeg.ass_filter` after scaling/cropping, at the export's real frame size
  (`exports.output_size`, rotation-aware via `MediaInfo.display_size`). Fonts are bundled
  (OFL) in `captions/fonts/` and also served at `/api/fonts` for the browser preview; keep
  `FONTS`/sizes in `captions/style.py` + `ass.py` in sync with `frontend/.../CaptionOptions.tsx`.
- **Trimming**: `PATCH /api/clips/{id}` changes start/end; `suggested_start/end` keep the
  original suggestion for "reset". Thumbnails live in `thumbs/<clip>/<start_ms>.jpg` and are
  regenerated lazily when missing.
- **Schema changes**: bump `SCHEMA_VERSION` in `db/session.py` and add the upgrade SQL to
  `MIGRATIONS` (e.g. `ALTER TABLE ... ADD COLUMN`). Without a migration path the DB and stored
  project files are reset (all data is temporary). Use Alembic once data must survive.

## Layout

```
backend/twapza/
  config.py            Settings (pydantic-settings, TWAPZA_* env vars)
  api/app.py           FastAPI app factory; api/routes/{uploads,imports,projects,jobs,clips}.py
  api/schemas.py       Response/request models (keep DB models out of responses)
  db/models.py         SQLModel tables: Project, UploadPart, Job, Clip
  db/session.py        Engine (SQLite WAL), init_db(), get_session dependency
  storage/             Storage protocol + LocalStorage
  queue/__init__.py    RQ queue, enqueue_job(), ProgressReporter, run_tracked()
  media/ffmpeg.py      probe / extract_audio / make_proxy / cut_clip / extract_frame / run_ffmpeg
  transcription/       Transcript model + Transcriber protocol; faster_whisper.py backend
  clipping/snapping.py pure: word-gap boundaries, scoring, snap_cut()
  clipping/simple.py   pure: plan_simple_clips() (Feature 1)
  clipping/llm.py      transcript chunking, prompt, HIGHLIGHT_SCHEMA, parse_highlights(), ClaudeHighlighter
  clipping/signals.py  audio energy profile/score, PySceneDetect scene cuts
  clipping/dedupe.py   pure: overlap metrics + greedy NMS
  clipping/highlights.py  ask_for_candidates() (concurrent chunks), refine(), build_highlights()
  importing/youtube.py YouTube link parsing, yt-dlp info lookup + download (ImportFailed)
  captions/            style.py (CaptionSettings, bundled FONTS), ass.py (pure ASS generation), srt.py, fonts/
  exports.py           ExportSettings, output_size, deterministic export keys, download filenames
  workers/tasks.py     RQ entrypoints (take string IDs only)
  workers/__main__.py  `python -m twapza.workers`
  cleanup.py           expiry + orphan sweep + job watchdog loop; `python -m twapza.cleanup [--once]`
backend/tests/         pytest (unit + ffmpeg integration on synthetic media)
frontend/src/
  api/client.ts        typed API client
  lib/upload.ts        chunked upload with retry; resumes across reloads (localStorage key per file)
  lib/jobs.ts          watchJob() over SSE, runAndDownload() for export jobs
  hooks/useJob.ts      SSE job subscription
  components/ClipPlayer.tsx  plays [start,end] of the proxy, loads lazily; CSS previews 9:16 framing
  components/ExportOptions.tsx  download format picker (9:16 blur/bars/crop, original, 1080p upscale, subtitles)
  components/YoutubeImportForm.tsx  link + rights form (home page tab next to UploadForm)
  components/ClipsWorkspace.tsx  shared download format + AI highlights / Simple clips tabs
  components/HighlightsPanel.tsx, HighlightCard.tsx, TrimControls.tsx  ranked AI list + trim
  components/CaptionOptions.tsx  caption style controls + live 9:16 preview
  components/JobProgress.tsx  progress bar + Cancel; RecentProjects.tsx  home page list + delete
  components/, pages/  UI (Tailwind)
```

To add a hosted transcription API: implement `Transcriber` in `transcription/<name>.py`
and register it in `transcription/get_transcriber()` (selected by `TWAPZA_TRANSCRIBER`).

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
- Schema changes go through `SCHEMA_VERSION` + `MIGRATIONS` in `db/session.py` (see above).
- Frontend: function components + hooks, Tailwind utility classes, no global state
  library. Keep API types in `api/client.ts` in sync with `api/schemas.py`.
- Naming: the app is **Twapza**; lowercase `twapza` for packages, services, env prefixes.

## Running

With Docker (recommended):

```bash
cp .env.example .env        # add ANTHROPIC_API_KEY when you reach AI highlights
docker compose up --build   # UI: http://localhost:8080 · API docs: http://localhost:8000/docs
```

One worker processes jobs one at a time. For parallel exports/transcriptions:
`docker compose up --scale twapza-worker=2`. GPU transcription (untested on real hardware):
`docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build`.

Without Docker (needs Python 3.11+, Node 22, ffmpeg, redis-server):

```bash
cd backend && python -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
redis-server &                                    # or any Redis on REDIS_URL
pip install -e ".[whisper]"                       # faster-whisper (model downloads on first use)
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

Tests use a per-test temp storage dir + SQLite DB, an inline (synchronous) RQ queue on
fakeredis (also patched in for jobs that workers enqueue themselves), and a
`FakeTranscriber` producing scripted sentences, so no Redis, model download or API key
is needed. AI tests patch `workers.tasks.get_highlighter` with a scripted finder;
`test_llm.py::test_real_sdk_request_on_the_wire` drives the real Anthropic SDK against a mock
HTTP transport to check the request shape. Synthetic videos are
generated with ffmpeg's `testsrc`/`sine` sources (`tests/conftest.py::make_test_video`).
External services (Whisper, Claude) must be faked behind their protocols in tests.

## Build stages

1. ✅ Skeleton: Compose, chunked upload with rights checkbox, RQ jobs with SSE progress, ingest (probe/audio/proxy), cleanup.
2. ✅ Transcription (faster-whisper) + simple clipping with sentence-boundary snapping, downloads + ZIP.
3. ✅ AI highlights (Claude), audio-energy/scene refinement, de-duplication, ranked list + trim UI.
4. ✅ Burned-in word-highlight captions (ASS). (9:16 centre crop + blurred-fit was pulled
   forward into Stage 2; face-tracked crop remains a later option.)
5. ✅ Polish: cancellation, job watchdog, friendly errors, limits in the UI, resumable uploads,
   recent projects + delete, orphan cleanup, GPU compose override, README.
6. ✅ YouTube Shorts focus: YouTube link import (yt-dlp), whole-frame 9:16 fit by default
   (blur / black bars; crop optional), subtitles on by default + .srt download.

Possible next steps: face-tracked vertical crop, editable caption text, hosted
transcription backend, S3 storage backend, auth for multi-user hosting.

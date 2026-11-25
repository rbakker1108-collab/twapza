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
- **Every project belongs to an account** (`Project.user_id`); routes only return the logged-in
  user's own projects/clips/jobs (someone else's is a 404, never a 403).
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
- **Descriptions + credit** (`clipping/descriptions.py`): per clip, `POST /api/clips/{id}/description`
  has Claude (`ClaudeDescriber`, same model, effort `medium`, structured output, `fallbacks:
  "default"`) write a hook description + hashtags, saved on `Clip.description/hashtags` (cleared
  when the clip is trimmed). The **credit block is never written by the model**: `credit_text()`
  builds it from `Project.source_channel/source_title/source_url/source_channel_url` (filled in by
  the YouTube import, editable via `PATCH /api/projects/{id}`), and `compose()` joins description →
  credit → hashtags at read time, so editing the credit updates every description. Without an API
  key, `fallback_copy` gives a plain description. The route's `get_describer` dependency is
  overridden with a fake in tests.
- **Retention boosts** (all optional, off by default; `ExportSettings.hook_text/cold_open/cut_pauses`):
  an export plays a list of source `Segment`s (`clipping/timeline.py`, pure): `remove_pauses` shortens
  silences between words > 0.45 s to 0.2 s; `with_cold_open` puts a 1.5-6 s teaser first: Claude's
  `teaser` quote from AI highlights (`Clip.teaser`, located with `find_quote`), else `pick_teaser`
  (loudest non-opening sentence via `signals.loudness_between`, then `!`/`?`). `workers.tasks.clip_segments`
  builds the list; `ffmpeg.cut_segments` renders it: each forward-moving run is one seeked input decoded once (`select` on the frame grid + sample-exact `atrim`), runs joined with `concat`. Never split one input into many `trim` branches: ffmpeg buffers raw frames (GBs) and Docker OOM-kills it.
  `build_ass`/`build_srt` take `segments=` so captions follow the edit (`map_words`); the `.srt`
  endpoint takes `?cut_pauses=&cold_open=` to match a download. `hook_text` draws `Clip.title` as a
  boxed top-third ASS event for the first 3 s (`hook_event`). `export_key` includes the title/teaser
  when those options are on. Titles: the description call also returns 3 `titles`
  (`Clip.title_options`); `PUT /api/clips/{id}/title` sets the clip title (= hook text). While the
  option is ticked, every clip card shows `HookTextEditor` (edit the hook text, "Suggest" → title
  ideas) and `ClipPlayer` previews it, so it is set *before* the one download.
  AI highlights take `{"short": true}` for the "short & loopable" style (20-45 s, loop-friendly
  endings; `system_prompt(short=...)`, `tasks.SHORT_LENGTHS`).
- **Clip editor** (`ClipEditor.tsx`, "Edit & download", the main button on every clip card): the
  user edits everything there, then downloads from it (saves texts/fixes first, then
  `runAndDownload`); "Quick download" on the card skips the editor. Tabs: "Hook & text" (hook on/off,
  `HookTextEditor`, duration), "Fix captions", "Format & style" (`ExportOptions`; changes go back to the
  page through `onSettingsChange`, so they are shared and remembered). The stage plays the clip with
  **live subtitles** (`lib/captions.ts` mirrors `ass.group_words`/`caption_events`; keep them in sync)
  and previews hook text and progress bar. Drag texts onto a stage shaped like
  the download; each `TextOverlay` (`api/schemas.py`: x/y = centre as fractions of the frame,
  size = font em as a fraction of the frame width, font, colour, style outline|box|plain,
  start/end seconds from the clip start, end null = whole clip) is saved as JSON on `Clip.overlays`
  (`PUT /api/clips/{id}/overlays`) and burned in by `build_ass(boxes=...)` (`tasks.clip_boxes` → `TextBox`
  in source time, mapped through the edit with `timeline.map_span`, `\pos` + per-text style). **Size
  fidelity**: libass sizes fonts by ascent+descent, so `style.EM_PER_ASS_SIZE` (mirrored as
  `CAPTION_FONTS[*].em` in the frontend) converts; `test_overlays.py` measures it. Colour emoji can't be
  rendered (they come out as monochrome glyphs). The "Fix captions" tab edits words
  (`GET /api/clips/{id}/words`, `PUT /api/projects/{id}/corrections`): fixes are stored per project in
  `corrections.json` keyed by word start (`tasks.word_key`) and applied by `load_transcript()` (pass
  `corrected=False` for the raw words); saving refreshes `Clip.text` and deletes the project's cached
  exports. Other export options: `hook_full` (hook for the whole clip), `cut_fillers` (um/uh/ehm…,
  `timeline.FILLERS`, `remove_pauses(fillers=True)`), `progress_bar` (animated ASS drawing:
  `ass.progress_events`; ffmpeg's drawbox can't animate). AI highlights take an optional `focus`
  ("Look for…", appended to the cached system prompt as a quoted request). The frontend remembers
  the download settings in localStorage (`twapza.downloadSettings`, `ClipsWorkspace.loadSavedSettings`).
- **Captions** (`captions/`): `ExportSettings.captions` (`CaptionSettings`: font, colours,
  size, position, words per line, uppercase) → `captions/ass.py::build_ass` (pure: words in the
  clip range, rebased to 0, grouped into pages of N words broken at sentence ends/pauses; one
  ASS event per spoken word re-draws the page with that word in the highlight colour) → burned by
  `ffmpeg.ass_filter` after scaling/cropping, at the export's real frame size
  (`exports.output_size`, rotation-aware via `MediaInfo.display_size`). Fonts are bundled
  (OFL) in `captions/fonts/` and also served at `/api/fonts` for the browser preview; keep
  `FONTS`/sizes in `captions/style.py` + `ass.py` in sync with `frontend/.../CaptionOptions.tsx`.
  **Languages**: Whisper auto-detects the spoken language (or `TWAPZA_WHISPER_LANGUAGE`); the Latin
  fonts cover Spanish/French/German/Dutch accents. Arabic: `ass.font_for` switches any caption/hook/text
  containing Arabic to the bundled `NotoSansArabic-ExtraBold.ttf` (`style.ARABIC_FONT`, sized so the em
  matches the chosen font), and every text style uses Encoding `-1` so libass picks the base direction
  (right-to-left). Browser previews fall back to the same font (`ARABIC_FALLBACK`). Other scripts
  (CJK, Cyrillic, …) would need their own bundled font the same way.
- **Trimming**: `PATCH /api/clips/{id}` changes start/end; `suggested_start/end` keep the
  original suggestion for "reset". Thumbnails live in `thumbs/<clip>/<start_ms>.jpg` and are
  regenerated lazily when missing.
- **Schema changes**: bump `SCHEMA_VERSION` in `db/session.py` and add the upgrade SQL to
  `MIGRATIONS` (e.g. `ALTER TABLE ... ADD COLUMN`). Without a migration path the DB and stored
  project files are reset (temporary tables only). **Account tables are permanent and never reset**, so any
  change to them needs a migration. Move to Alembic (and Postgres) before real traffic.

- **Website** (`frontend/src/marketing/`): `MarketingLayout` serves `/`, `/features`, `/solutions`,
  `/pricing`, `/resources[/:slug]`, `/how-it-works` (`HowItWorksPage.tsx`: six steps with real screenshots and
  muted, looping screen recordings in `public/how-it-works/`, made from a demo project with stand-ins for Whisper/Claude;
  re-shoot them after big UI changes; videos play only while on screen and not with reduced motion; linked as "Help"
  in the app header), `/coming-soon` (`ComingSoonPage.tsx`: features in development + contact
  `twapza@gmail.com`, `legal/types.CONTACT_EMAIL`), `/privacy` + `/terms` (`LegalPage.tsx`; texts are whole
  documents per language in `marketing/legal/{privacy,terms}.ts`, not `t()` keys; `legal.test.tsx` checks every
  language has the same structure; bump `LEGAL_UPDATED` when changing them, and keep the facts true to the app)
  and the auth pages (`/login`, `/signup[?plan=&period=]`,
  `/forgot-password`, `/reset-password?token=`; `pages/AuthPages.tsx`); the app (`AppLayout`, wrapped in
  `RequireAuth`) lives at `/app`, `/projects/:id` and `/account`. Copy is in `content.ts` (steps, features,
  audiences, FAQ, guides), display prices/features in `plans.ts` (keep in sync with `accounts/plans.py`).
  `/tools[/:slug]` (`ToolsPage.tsx`, `content.TOOLS`: one search-friendly page per job Twapza does) and
  `/solutions/:slug` (`SolutionsPage.SolutionPage`, `content.AUDIENCES`), both in the header dropdowns (`NavMenu`; full
  menu from `xl`, ☰ below). Hero link box (`HeroLinkBox.tsx`, also on tool/use-case pages): a pasted YouTube link is kept
  in localStorage (`lib/pendingLink.ts`, 3 days), the visitor goes to `/signup` (or `/app`), and `UploadPage` fills it
  into `YoutubeImportForm(initialUrl)`; the rights checkbox is still required, so it never imports by itself.
  `/compare[/:slug]` (`ComparePage.tsx`, data in `content.COMPARISONS`): honest comparisons with other clipping tools;
  only state facts about them that their own site and several reviews agree on, say where they are stronger, no
  competitor prices, and update `COMPARISONS_CHECKED` (shown as "checked in …") when re-checking.
  Don't claim features that don't exist. The old early-access list (`POST /api/waitlist`, `WaitlistEntry`)
  is no longer on the site; its data is kept (`python -m twapza.waitlist [--remove EMAIL]`).
- **SEO** (`marketing/locale.ts`, `seo.ts`, `entry-server.tsx`, `scripts/prerender.mjs`): every website page has a URL per
  language: English at the plain address, others under `/nl`, `/es`, `/de`, `/fr`, `/ar` (`SITE_PATHS` + guides; `localize`,
  `splitLang`). On those pages the URL decides the language (`MarketingLayout` effect); someone who picked another language
  is redirected from the English address; the `LanguageSwitcher` changes the URL there. Marketing code imports `Link`/`NavLink`
  from `marketing/links.tsx` so links stay in the visitor's language (login/app paths are left alone). `npm run build` also
  builds `entry-server.tsx` with `vite build --ssr` and `prerender.mjs` writes `dist/<lang>/<page>/index.html` for every page ×
  language: rendered HTML plus the `<!--seo-->` block of `index.html` replaced by `seo.headHtml` (title, description, canonical,
  hreflang + x-default, Open Graph with `public/og-image.png`, JSON-LD: WebSite/Organization/SoftwareApplication/FAQPage on the
  home page, offers on pricing, Article + breadcrumbs on guides) and `dist/sitemap.xml`. `main.tsx` hydrates pre-rendered pages
  (language from `<html lang>`), so their first render must match the server's: no `window`/`localStorage` reads during
  render (use an effect). nginx serves `$uri/index.html`, else `spa.html` (app shell, `noindex`). New website page: add it to
  `SITE_PATHS`, the `websitePages` routes in `App.tsx` and `seo.PAGES` (translated title + description).
- **Accounts** (`accounts/`, `api/routes/auth.py`): email + password (`passwords.py`: stdlib scrypt, 8-128
  chars). Login = server-side session: random token in an HttpOnly SameSite=Lax cookie `twapza_session`
  (Secure when `TWAPZA_PUBLIC_URL` is https), only its SHA-256 stored (`AuthSession`). `api/deps.current_user`
  (401) / `optional_user`. Password reset: single-use 1 h token (`PasswordReset`), emailed via SMTP
  (`mail.py`; logged when `TWAPZA_SMTP_HOST` is unset), logs out other sessions; forgot-password answers the
  same whether or not the email exists. Rate limits in Redis (`ratelimit.hit`, fails open; client IP = last
  X-Forwarded-For entry from nginx). Account tables (`User`, `AuthSession`, `PasswordReset`, `UsageEvent`,
  `WaitlistEntry`) are **permanent** (`db/session.PERMANENT_TABLES`: kept by a schema reset, never touched by
  the retention cleanup; `cleanup_logins` drops expired sessions/reset tokens). Delete account
  (`accounts/users.delete_user`) cancels the subscription, deletes projects + files. Admin CLI:
  `python -m twapza.users list | set-plan EMAIL PLAN | delete EMAIL | clear-subscription EMAIL|--all` (`set-plan` =
  status `manual`; `clear-subscription` forgets payment-provider IDs, e.g. after moving from test to live mode).
- **Email verification**: signup sends a 48 h link (`EmailVerification`, hashed token, permanent table) to
  `/verify-email?token=` (`POST /api/auth/verify-email` confirms, deletes the user's links and logs that device in;
  `POST /api/auth/resend-verification`, 3/hour). `User.email_verified_at`; uploads/imports need it
  (`uploads.require_verified`, 403) unless `TWAPZA_EMAIL_VERIFICATION=false`; a password reset also confirms the
  address; schema v10 marked existing accounts confirmed. `AccountRead.email_verified`; the app shows
  `ConfirmEmailBanner` until then.
- **Protection + monitoring**: `ratelimit.ai_daily` caps Claude-backed requests per account per UTC day
  (`Plan.ai_per_day`: AI highlights runs + description writes; 429). `/api/health` checks the database and Redis
  (503 when down) for uptime monitors. `monitoring.init_sentry(component)` (api/worker/scheduler) when
  `TWAPZA_SENTRY_DSN` is set: no PII, no tracing. `queue.EXPECTED_ERRORS` (our readable error types) are logged as
  warnings, everything else with `log.exception`, so only real bugs reach Sentry.
- **Plans + limits** (`accounts/plans.py`, pure; `usage.py`): Free 60 min/month, videos ≤ 60 min, watermark;
  Creator 300 min, ≤ 120 min, `editing`; Pro 1200 min, ≤ 180 min, `zip`, `priority`. `effective_plan_id`
  (paid statuses active/trialing/past_due/scheduled_cancel/manual; a passed `ends_at` counts as ended), months run from
  `User.period_anchor` (`period_bounds`). Minutes are charged once per project at the end of ingest
  (`usage.record_usage` → `UsageEvent`); ingest/import fail with a readable message when the video is too long
  for the plan or doesn't fit the minutes left (`usage.video_problem`; import checks before downloading);
  `require_minutes_left` refuses new uploads/imports at 0 minutes (402). `editing` gates (402 `NEEDS_CREATOR`):
  overlays/corrections PUT, AI description POST, and exports with hook_text/cold_open/cut_pauses/cut_fillers.
  `clips.plan_settings` forces `ExportSettings.watermark` (Free; ASS `Watermark` event, "Made with Twapza",
  top right) and `texts` (overlays burned in only with `editing`) whatever the browser sends; both are part of
  the export key. ZIP needs Pro. `queue.with_priority` sends Pro jobs to `<queue>-priority`, which workers
  drain first. Frontend: `auth/AuthProvider` (`useAuth`, `usePlan`: everything allowed when no account is
  loaded, e.g. component tests; `choosePlan`), `auth/UpgradeNote`, locked boosts in `ExportOptions`, locked
  editor tabs, `DownloadAllButton`/`DescriptionPanel` upgrade notes.
- **Billing** (`accounts/billing.py`, `api/routes/billing.py`): **Creem** (merchant of record: sells to the customer,
  handles VAT/sales tax; accepts individuals, so no company registration is needed for it). REST + JSON via httpx,
  no SDK, `x-api-key` header; `creem_test_…` keys use `https://test-api.creem.io`, others `https://api.creem.io`
  (`Settings.creem_test_mode`). Docs: docs.creem.io (`llms.txt` lists the pages; endpoint shapes were checked
  against its API reference). `POST /api/billing/checkout {plan, period}` → `POST /v1/checkouts` (`product_id`,
  `request_id` = user id, `customer` {id} when known else {email}, `success_url` `/account?upgraded=1`, `metadata`
  {user_id}, which Creem copies onto the subscription) → `checkout_url`; before that `_found_running_subscription`
  looks the email up (`GET /v1/customers?email=` → `/v1/customers/{id}/subscriptions`) so nobody pays twice when a
  webhook was lost. `POST /api/billing/change-plan` → `POST /v1/subscriptions/{id}/upgrade`
  (`proration-charge-immediately`, applied straight away; the UI asks to confirm first). `GET /api/billing/portal` →
  `POST /v1/customers/billing` → `customer_portal_link`. `POST /api/billing/webhook` verifies `creem-signature`
  (hex HMAC-SHA256 of the raw body), and for `checkout.completed` / `subscription.*` **re-reads the subscription**
  (`GET /v1/subscriptions?subscription_id=`) and `apply_subscription` copies it (product → plan/period via the four
  `TWAPZA_CREEM_PRODUCT_*`; `current_period_end_date`; status `scheduled_cancel` → `ends_at`), so duplicate or
  out-of-order events are harmless. User found by `metadata.user_id`, then `subscription_id`, then `customer_id`.
  Without `TWAPZA_CREEM_API_KEY` billing endpoints answer 503 and the UI says paid plans can't be bought.
  `python -m twapza.creem_setup` creates the four recurring products (USD, tax-exclusive, `saas`, idempotency keys
  `twapza_<plan>_<period>`) and prints the `.env` lines. Creem's checkout has no language setting. Tests replace the
  `billing_client` dependency with `FakeCreem`; the real client's request shape is checked with an httpx mock
  transport. (History: Lemon Squeezy, then Stripe Managed Payments, which needs a KvK registration. Schema v9
  renamed `User.variant_id` → `price_id`, which now holds the Creem product ID.)

## Layout

```
backend/twapza/
  config.py            Settings (pydantic-settings, TWAPZA_* env vars)
  api/app.py           FastAPI app factory; api/routes/{auth,billing,uploads,imports,projects,jobs,clips,waitlist}.py
  api/deps.py          current_user / optional_user (session cookie)
  api/schemas.py       Response/request models (keep DB models out of responses)
  db/models.py         SQLModel tables: Project, UploadPart, Job, Clip; User, AuthSession, PasswordReset, UsageEvent, WaitlistEntry
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
  clipping/descriptions.py  credit_text/compose/normalize_hashtags/parse_copy/clean_titles (pure), ClaudeDescriber
  clipping/timeline.py pure: Segment, remove_pauses, with_cold_open, map_words, find_quote, pick_teaser
  importing/youtube.py YouTube link parsing, yt-dlp info lookup + download (ImportFailed)
  captions/            style.py (CaptionSettings, bundled FONTS), ass.py (pure ASS generation), srt.py, fonts/
  exports.py           ExportSettings, output_size, deterministic export keys, download filenames
  workers/tasks.py     RQ entrypoints (take string IDs only)
  workers/__main__.py  `python -m twapza.workers`
  accounts/            passwords.py, plans.py (pure limits), usage.py, users.py, billing.py (Creem), mail.py, ratelimit.py
  users.py             account admin CLI (list, set-plan, delete)
  creem_setup.py       creates the Creem products, prints the .env lines
  waitlist.py          early-access list CLI (CSV export, --remove)
  cleanup.py           expiry + orphan sweep + job watchdog loop; `python -m twapza.cleanup [--once]`
backend/tests/         pytest (unit + ffmpeg integration on synthetic media)
frontend/src/
  api/client.ts        typed API client
  auth/                AuthProvider (useAuth, usePlan, choosePlan), RequireAuth, UpgradeNote
  pages/AuthPages.tsx, AccountPage.tsx  login/sign-up/reset pages; plan, minutes, upgrade, password, delete
  lib/upload.ts        chunked upload with retry; resumes across reloads (localStorage key per file)
  lib/jobs.ts          watchJob() over SSE, runAndDownload() for export jobs
  hooks/useJob.ts      SSE job subscription
  components/ClipPlayer.tsx  plays [start,end] of the proxy, loads lazily; CSS previews 9:16 framing
  components/ExportOptions.tsx  download format picker (9:16 blur/bars/crop, original, 1080p upscale, subtitles)
  components/YoutubeImportForm.tsx  link + rights form (home page tab next to UploadForm)
  components/CreditEditor.tsx, DescriptionPanel.tsx  original-creator credit + per-clip description
  components/HookTextEditor.tsx  per-clip hook text + Claude title ideas (shown while "Hook text" is on)
  components/ClipEditor.tsx  edit-then-download: hook, drag-and-drop texts, live subtitles, fix captions, format
  lib/captions.ts      caption pages + highlighted word for the live preview (mirrors captions/ass.py)
  components/ClipsWorkspace.tsx  shared download format + AI highlights / Simple clips tabs
  components/HighlightsPanel.tsx, HighlightCard.tsx, TrimControls.tsx  ranked AI list + trim
  components/CaptionOptions.tsx  caption style controls + live 9:16 preview
  components/JobProgress.tsx  progress bar + Cancel; RecentProjects.tsx  home page list + delete
  marketing/           website: MarketingLayout, LandingPage, Features/Solutions/Pricing/ResourcesPage, content.ts, plans.ts
  components/, pages/  UI (Tailwind); App.tsx = shell (nav, language menu, footer)
  i18n/                translations: index.tsx (provider, t, msg), nl/es/de/fr/ar.ts, server.ts, i18n.test.ts
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
- **Theme** (dark, black + orange): use the named colours from `src/index.css` `@theme`
  (`bg-canvas`, `bg-surface`/`-2`/`-3`, `text-ink`/`ink-soft`/`muted`/`faint`, `border-line`/`line-strong`,
  `brand-50…950` orange; primary buttons are `bg-brand-500 text-black`), not raw `slate`/`indigo`.
  Fonts are self-hosted (`@fontsource-variable/inter` + `noto-sans-arabic`; no Google Fonts: GDPR).
  Logo: `components/Logo.tsx` (= `public/favicon.svg`).
- **Translations** (`src/i18n/`): every visible text is English wrapped in `t("…")` (from `useT()`/`useI18n()`),
  or `msg("…")` for constants translated where shown; placeholders `{name}`. The interface starts in **English**;
  only a language picked in the menu (`localStorage twapza.lang`) changes it (not the browser language). Add each new text to
  `nl/es/de/fr/ar.ts`: `i18n.test.ts` scans the source and fails on missing/unused keys or placeholder
  mismatches. Arabic is right-to-left (`<html dir="rtl">`): use logical utilities (`ms-/me-/ps-/pe-/start-/end-/
  text-start`), and keep video stages `dir="ltr"`. Backend progress messages are translated on the client
  (`i18n/server.ts`); API error messages are still English.
- Naming: the app is **Twapza**; lowercase `twapza` for packages, services, env prefixes.

## Running

With Docker (recommended):

```bash
cp .env.example .env        # add ANTHROPIC_API_KEY when you reach AI highlights
docker compose up --build   # UI: http://localhost:8080 (sign up at /signup) · API docs: http://localhost:8000/docs
```

Production (www.twapza.io): `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`
adds Caddy (`deploy/Caddyfile`: automatic Let's Encrypt HTTPS for `TWAPZA_DOMAIN`, redirect from
`TWAPZA_REDIRECT_DOMAIN`, security headers, unbuffered SSE), unpublishes port 8080, and sets
`TWAPZA_PUBLIC_URL=https://…` and `TWAPZA_TRUSTED_PROXY_HOPS=2` (Caddy + nginx; `ratelimit.client_ip`
reads the N-th X-Forwarded-For entry from the end). `frontend/public/robots.txt` keeps the app out of search engines; `sitemap.xml` is generated
at build time (see **SEO** above).

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
7. ✅ Clip descriptions (Claude) with an exact credit to the original creator (editable).
8. ✅ Optional retention boosts: hook text, cold open, cut pauses; title ideas; short & loopable AI style.
9. ✅ Opus-style editing: clip editor (drag-and-drop texts, fix captions), whole-clip hook, filler-word
   removal, progress bar, "Look for…" AI prompt, remembered download settings.
10. ✅ Product UI: dark black/orange theme, logo, app shell, hero home page with project grid, step
    indicator, interface in English, Dutch, Spanish, German, French and Arabic (RTL).

11. ✅ Website: landing page, Features, Solutions, Pricing, Resources (guides), early-access waitlist;
    app moved to `/app`.
12. ✅ Accounts (email + password, sessions, reset, delete) and paid plans via Creem (merchant of record): monthly
    minutes, video length, watermark, Creator/Pro features, priority queue, account page.

Possible next steps: email verification, Google login, terms + privacy pages, face-tracked vertical crop
(AI reframe), own logo/watermark and image stickers, keyword-highlighted captions, background music (own
track, ducked under speech), 1:1 / 4:5 formats, hosted transcription backend, S3 storage backend,
Postgres + Alembic (accounts are permanent data now).

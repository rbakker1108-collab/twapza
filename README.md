# Twapza

Turn your own long-form videos into short clips.

> **Status: Stage 2 of 5.** Upload, automatic transcription and simple clipping (cuts
> snapped to sentence ends) with single-clip and ZIP downloads work. Clips download as
> vertical 1080×1920 for YouTube Shorts / TikTok / Reels (centre crop or blurred-fit) or in
> the original shape. AI highlights and captions are coming in the next stages.

Twapza works only with videos you upload yourself (mp4, mov or mkv, up to about 3 hours
and 20 GB). Before uploading, you confirm that you own the video or have permission to
use it. Your original file is never modified, and everything is deleted automatically
after 24 hours.

## Quick start

```bash
cp .env.example .env
docker compose up --build
```

- App: <http://localhost:8080>
- API docs: <http://localhost:8000/docs>

The first transcription downloads the Whisper model (`small`, ~500 MB) into the
`twapza-data` volume. Transcription runs on the CPU, so long videos take a while;
set `TWAPZA_WHISPER_MODEL=base` in `.env` for faster, less accurate results.

## Development

See [CLAUDE.md](CLAUDE.md) for the architecture, conventions and how to run Twapza
without Docker.

```bash
make test   # backend (pytest) + frontend (vitest, typecheck)
```

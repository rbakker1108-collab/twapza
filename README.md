# Twapza

Turn your own long-form videos into short clips.

> **Status: Stage 1 of 5.** Upload, background processing and preview work. Clipping,
> AI highlights, vertical crop and captions are coming in the next stages.

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

## Development

See [CLAUDE.md](CLAUDE.md) for the architecture, conventions and how to run Twapza
without Docker.

```bash
make test   # backend (pytest) + frontend (vitest, typecheck)
```

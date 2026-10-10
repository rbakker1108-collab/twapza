# Twapza

Turn your long-form YouTube videos (podcasts, talks, streams, interviews) into viral
YouTube Shorts (and TikTok / Instagram Reels). Paste a link to your video, or upload the file.

- **AI highlights:** Claude reads the transcript and picks the strongest standalone moments
  (strong hooks, emotional peaks, surprises, humour, clear takeaways), refined with audio
  energy and scene changes, ranked by score. Trim any clip with a slider.
- **Simple clips:** split the whole video into clips of ~N seconds (15–180), with every cut
  snapped to a natural pause or sentence end.
- **Vertical 1080×1920** showing the whole picture scaled to fit (over a blurred background or
  black bars), or a centre crop, or the original shape with optional 1080p upscaling.
- **Subtitles**, on by default: burned in with word-by-word highlighting (four bundled fonts,
  your colours, size, position and words on screen), plus a `.srt` file per clip.
- Download clips one by one or all at once as a ZIP.

Twapza is for **your own** videos: paste a link to a single YouTube video you posted (public or
unlisted), or upload a file (mp4, mov or mkv, up to 20 GB). Videos can be up to 3 hours long.
Either way you first confirm that you own the video or have permission to use it.
Your original file is never modified, and everything is deleted automatically after
24 hours (or immediately, with **Delete** on the home page).

## Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- ~4 GB free disk space for the images and the Whisper model, plus room for your videos
- For AI highlights: a Claude API key from the [Claude Console](https://console.anthropic.com)
  (pay-as-you-go; see [Costs](#costs)). Everything else works without one.

## Quick start

```bash
git clone https://github.com/rbakker1108-collab/twapza.git
cd twapza
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env
# optional: put your key in .env  →  ANTHROPIC_API_KEY=sk-ant-api...
docker compose up --build
```

Open **<http://localhost:8080>**. Stop with `Ctrl+C` or `docker compose down`.
Your projects survive restarts (they live in the `twapza-data` Docker volume until they expire).

The first transcription downloads the Whisper model (`small`, ~500 MB) once.

## Using Twapza

1. **Paste a YouTube link** (e.g. `https://youtu.be/…`), tick the ownership box, click
   **Import from YouTube**. Or switch to **Upload a file**: drop a video and click **Upload**
   (large uploads can be paused; choosing the same file again resumes, even after a reload).
2. Twapza builds a preview and **transcribes** the video in the background (progress is shown).
3. Pick a **download format**: vertical with blurred background (default), black bars or centre
   crop, or the original shape; subtitles on (default) or off, and their style.
4. **AI highlights** tab → **Find highlights** → review the ranked list, play, **Trim**,
   **Download** (or **Download all (ZIP)**). **Subtitles (.srt)** gives a subtitle file to
   upload alongside the Short.
   **Simple clips** tab → choose a length → **Generate clips**.
5. Long-running steps can be **canceled**. Your recent projects are listed on the home page.

## Configuration

All settings live in `.env` (see `.env.example` for every option). The most useful:

| Setting | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(empty)* | Enables AI highlights. Never commit it. |
| `TWAPZA_CLAUDE_MODEL` | `claude-sonnet-5-5` | Model used for highlights. |
| `TWAPZA_CLAUDE_EFFORT` | `high` | `low`/`medium`/`high`/`xhigh`/`max`: thoroughness vs. cost. |
| `TWAPZA_WHISPER_MODEL` | `small` | `tiny`/`base`/`small`/`medium`/`large-v3`: accuracy vs. speed. |
| `TWAPZA_WHISPER_LANGUAGE` | *(auto)* | Force a language, e.g. `en` or `nl`. |
| `TWAPZA_MAX_UPLOAD_GB` | `20` | Largest upload. |
| `TWAPZA_MAX_DURATION_MIN` | `180` | Longest video. |
| `TWAPZA_RETENTION_HOURS` | `24` | How long projects are kept. |
| `TWAPZA_YOUTUBE_ENABLED` | `true` | Show the "Paste a YouTube link" option. |
| `TWAPZA_YOUTUBE_MAX_HEIGHT` | `1080` | Highest resolution downloaded from YouTube. |
| `TWAPZA_MAX_HIGHLIGHTS` | `30` | Most AI highlights shown per video. |
| `TWAPZA_EXPORT_PRESET` / `TWAPZA_EXPORT_CRF` | `veryfast` / `20` | Export speed/quality (x264). |

After changing `.env`, restart: `docker compose down && docker compose up`.

## Costs

Only **AI highlights** cost money (Claude API, billed by Anthropic to your Console account).
Uploading, transcription, simple clips, cropping, captions and downloads all run locally for free.
With the default model we estimate roughly **$0.20–0.60 per hour of video** per run (an
estimate from token counts; check your Console for real figures). `TWAPZA_CLAUDE_EFFORT=medium`
is cheaper. Set a monthly spend limit in the Console to be safe.

## Speed tips

- One worker runs one job at a time. To run two at once: `docker compose up --scale twapza-worker=2`.
- Transcription on CPU takes a while for long videos. Use `TWAPZA_WHISPER_MODEL=base` for speed,
  or a GPU:

### Optional: NVIDIA GPU transcription

```bash
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

Needs an NVIDIA GPU, a recent driver and the
[NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/).
Only the worker changes (CUDA libraries + `TWAPZA_WHISPER_DEVICE=cuda`). This setup hasn't been
tested on GPU hardware yet; if it fails to start, the CPU setup above always works.

## Troubleshooting

| Problem | Fix |
|---|---|
| `no configuration file provided` | Run Docker commands in the `twapza` folder (where `docker-compose.yml` is). |
| Changes don't show up after `git pull` | Rebuild: `docker compose up --build`. |
| AI tab says to add a key | Put `ANTHROPIC_API_KEY=...` in `.env`, then restart. |
| "The Anthropic API key was rejected" | Create a new key in the Console (it starts with `sk-ant-api`), check you have credit. |
| A job says "Twapza stopped while this was running" | The worker restarted mid-job; just run it again. |
| "The server ran out of disk space" | Delete projects from the home page, or free space for Docker. |
| Upload interrupted | Choose the same file again; it resumes. |
| YouTube import fails ("blocking automated downloads", or a format error) | YouTube changes often. Update the downloader: `docker compose build --no-cache && docker compose up`. If it still fails, download the video from YouTube Studio and upload the file. |
| "This video is private" / "requires sign-in" | Make the video public or unlisted for the import, or upload the file. |
| See what's happening | `docker compose logs -f twapza-worker` |

## About YouTube imports

Importing uses [yt-dlp](https://github.com/yt-dlp/yt-dlp). Only import videos you own or have
permission to use. YouTube's Terms of Service restrict downloading, so check they allow your use;
downloading your own uploads from [YouTube Studio](https://studio.youtube.com) and using
**Upload a file** is always an option.

## How it works

React frontend → FastAPI API → Redis/RQ job queue → worker (yt-dlp, ffmpeg, faster-whisper, Claude,
PySceneDetect, libass) → files on local disk, metadata in SQLite. A scheduler deletes expired
projects and recovers jobs whose worker died. See [CLAUDE.md](CLAUDE.md) for the architecture,
conventions and how to develop without Docker.

## Development

```bash
make test          # backend (pytest) + frontend (vitest, typecheck)
make test-docker   # backend tests inside the image
```

## Licences

Caption fonts (Montserrat, Poppins, Anton, Bebas Neue) are bundled under the SIL Open Font
License; see `backend/twapza/captions/fonts/`.

"""Import a video from a YouTube link (via yt-dlp).

Only single YouTube videos are accepted (watch / youtu.be / shorts / live / embed
links); playlists and other sites are rejected. The user must still confirm they own
the video or have permission to use it.
"""

import re
import shutil
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlparse

VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}
_ANSI = re.compile(r"\x1b\[[0-9;]*m")


class ImportFailed(Exception):
    """A failure with a message meant for the user."""


def youtube_video_id(url: str) -> str | None:
    """The 11-character video id of a YouTube video link, or None if it isn't one."""
    url = url.strip()
    if not re.match(r"^https?://", url, re.IGNORECASE):
        url = "https://" + url
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    host = (parsed.hostname or "").lower()
    parts = [p for p in parsed.path.split("/") if p]
    candidate = None
    if host in YOUTUBE_HOSTS:
        if parsed.path == "/watch":
            candidate = (parse_qs(parsed.query).get("v") or [None])[0]
        elif len(parts) >= 2 and parts[0] in {"shorts", "live", "embed", "v"}:
            candidate = parts[1]
    elif host in {"youtu.be", "www.youtu.be"} and parts:
        candidate = parts[0]
    return candidate if candidate and VIDEO_ID.match(candidate) else None


def canonical_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


@dataclass(frozen=True)
class VideoInfo:
    id: str
    title: str
    duration: float | None
    is_live: bool


def _clean_error(exc: Exception) -> str:
    text = _ANSI.sub("", str(exc)).replace("ERROR: ", "").strip()
    text = re.sub(r"^\[[^\]]+\]\s*[\w-]+:\s*", "", text)  # "[youtube] abc123: " prefix
    text = re.split(r";\s*please report this issue", text, flags=re.IGNORECASE)[0].strip()
    lowered = text.lower()
    if any(s in lowered for s in ("unable to connect", "connection refused", "timed out",
                                  "name or service not known", "temporary failure in name resolution",
                                  "network is unreachable")):
        return "Couldn't reach YouTube. Check the server's internet connection and try again."
    if "private video" in lowered:
        return "This video is private. Make it public or unlisted, or upload the file instead."
    if "sign in to confirm your age" in lowered or "age-restricted" in lowered:
        return "YouTube requires sign-in for this video (age-restricted). Upload the file instead."
    if "sign in to confirm you" in lowered or "not a bot" in lowered:
        return ("YouTube is blocking automated downloads from this network right now. "
                "Try again later, or download the video from YouTube Studio and upload the file.")
    if "video unavailable" in lowered or "removed" in lowered:
        return "This video is unavailable on YouTube."
    return f"YouTube download failed: {text or exc.__class__.__name__}"


def _ydl_options(**extra) -> dict:
    return {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "retries": 3,
        "fragment_retries": 3,
        **extra,
    }


def fetch_info(url: str) -> VideoInfo:
    """Look up title, length and live status without downloading."""
    import yt_dlp

    try:
        with yt_dlp.YoutubeDL(_ydl_options(skip_download=True)) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as exc:
        raise ImportFailed(_clean_error(exc)) from None
    return VideoInfo(
        id=str(info.get("id") or ""),
        title=str(info.get("title") or "YouTube video"),
        duration=float(info["duration"]) if info.get("duration") else None,
        is_live=bool(info.get("is_live")),
    )


def download_video(url: str, dest: Path, *, max_height: int = 1080,
                   on_progress: Callable[[float], None] | None = None) -> None:
    """Download the best version up to ``max_height`` as an mp4 at ``dest``.

    yt-dlp downloads video and audio separately and merges them with ffmpeg;
    ``on_progress`` gets the overall fraction. Exceptions raised by
    ``on_progress`` (e.g. a cancel) stop the download.
    """
    import yt_dlp

    workdir = dest.parent / f".{dest.name}.download"
    shutil.rmtree(workdir, ignore_errors=True)
    workdir.mkdir(parents=True)
    state = {"parts": 1, "done": 0, "current": None}

    def hook(d: dict) -> None:
        if d.get("status") == "finished":
            state["done"] += 1
            return
        if d.get("status") != "downloading" or not on_progress:
            return
        total = d.get("total_bytes") or d.get("total_bytes_estimate")
        part = (d.get("downloaded_bytes") or 0) / total if total else 0.0
        on_progress(min(1.0, (state["done"] + min(part, 1.0)) / state["parts"]))

    h = int(max_height)
    options = _ydl_options(
        # Prefer mp4/m4a (no re-encode on merge); "<=?" also accepts formats of unknown height.
        format=(f"bv*[height<=?{h}][ext=mp4]+ba[ext=m4a]/bv*[height<=?{h}]+ba"
                f"/b[height<=?{h}]/bv*+ba/b"),
        merge_output_format="mp4",
        outtmpl=str(workdir / "video.%(ext)s"),
        progress_hooks=[hook],
        concurrent_fragment_downloads=4,
    )
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(url, download=False)
            state["parts"] = len(info.get("requested_formats") or [None])
            ydl.process_ie_result(info, download=True)
        files = sorted((p for p in workdir.iterdir() if p.is_file() and not p.name.endswith(".part")),
                       key=lambda p: (p.suffix != ".mp4", -p.stat().st_size))
        if not files:
            raise ImportFailed("YouTube download failed: no video file was produced.")
        shutil.move(str(files[0]), dest)
    except yt_dlp.utils.DownloadError as exc:
        raise ImportFailed(_clean_error(exc)) from None
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
    if on_progress:
        on_progress(1.0)

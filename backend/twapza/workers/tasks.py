"""RQ task entrypoints. Each takes plain string IDs so it is trivially serialisable."""

import json
import logging
import tempfile
import zipfile
from collections.abc import Callable
from pathlib import Path

from sqlmodel import Session, delete, select

from twapza import queue as jobqueue
from twapza import transcription
from twapza.captions.ass import build_ass
from twapza.captions.style import FONTS_DIR
from twapza.clipping.highlights import ask_for_candidates, build_highlights
from twapza.clipping.llm import ClaudeHighlighter, HighlightFinder, chunk_transcript
from twapza.clipping.signals import detect_scene_cuts, energy_from_wav
from twapza.clipping.simple import plan_simple_clips
from twapza.config import get_settings
from twapza.db.models import Clip, ClipSource, Job, JobType, Project, ProjectStatus
from twapza.db.session import get_engine
from twapza.exports import (
    ExportSettings, export_filename, export_key, output_size, video_filter,
)
from twapza.media import ffmpeg
from twapza.queue import ProgressReporter, run_tracked
from twapza.storage import get_storage
from twapza.transcription import Transcript

log = logging.getLogger(__name__)

Progress = Callable[[float], None]


class TaskError(Exception):
    """A failure with a message meant for the user."""


# --- helpers -----------------------------------------------------------------

def _get_project(project_id: str) -> Project:
    with Session(get_engine()) as session:
        project = session.get(Project, project_id)
        if project is None:
            raise TaskError("Project no longer exists (it may have expired).")
        return project


def _set_project(project_id: str, **fields) -> Project:
    with Session(get_engine()) as session:
        project = session.get(Project, project_id)
        if project is None:
            raise TaskError("Project no longer exists (it may have expired).")
        for name, value in fields.items():
            setattr(project, name, value)
        session.add(project)
        session.commit()
        session.refresh(project)
        return project


def _require_ready(project: Project) -> None:
    if project.status != ProjectStatus.READY:
        raise TaskError("The video has not finished processing yet.")


def load_transcript(project: Project) -> Transcript | None:
    storage = get_storage()
    if not storage.exists(project.transcript_key):
        return None
    with storage.open(project.transcript_key) as f:
        return Transcript.from_json(f.read().decode("utf-8"))


def _save_transcript(project: Project, transcript: Transcript) -> None:
    with get_storage().write_path(project.transcript_key) as dst:
        dst.write_text(transcript.to_json(), encoding="utf-8")


def ensure_transcript(project: Project, on_progress: Progress | None = None) -> Transcript:
    """Load the cached transcript, transcribing the audio first if needed."""
    if (existing := load_transcript(project)) is not None:
        return existing
    if not project.has_audio:
        transcript = Transcript.empty(project.duration or 0)
    else:
        with get_storage().read_path(project.audio_key) as audio:
            transcript = transcription.get_transcriber().transcribe(
                audio, duration=project.duration or 0, on_progress=on_progress,
            )
    _save_transcript(project, transcript)
    return transcript


def _clip(project_id: str, clip_id: str) -> Clip:
    with Session(get_engine()) as session:
        clip = session.get(Clip, clip_id)
        if clip is None or clip.project_id != project_id:
            raise TaskError("This clip no longer exists. Regenerate the clips and try again.")
        return clip


def render_export(project: Project, clip: Clip, settings: ExportSettings,
                  on_progress: Progress | None = None) -> str:
    """Render a clip with the given settings (if not already rendered). Returns its key."""
    storage = get_storage()
    key = export_key(clip, settings)
    if storage.exists(key):
        if on_progress:
            on_progress(1.0)
        return key
    app = get_settings()
    vf = video_filter(settings, project.width or 0, project.height or 0)
    with storage.read_path(project.original_key) as src, \
            tempfile.TemporaryDirectory(prefix="twapza-ass-") as tmp:
        if settings.captions:
            ass_text = _captions_for(project, clip, settings, src)
            if ass_text:
                ass_path = Path(tmp) / "captions.ass"
                ass_path.write_text(ass_text, encoding="utf-8")
                vf = ffmpeg.join_filters(vf, ffmpeg.ass_filter(ass_path, FONTS_DIR))
        with storage.write_path(key) as dst:
            ffmpeg.cut_clip(src, dst, clip.start, clip.end, preset=app.export_preset,
                            crf=app.export_crf, video_filter=vf, on_progress=on_progress)
    return key


def _captions_for(project: Project, clip: Clip, settings: ExportSettings, src: Path) -> str | None:
    """ASS subtitles for the clip, or None when nothing is said in it."""
    transcript = load_transcript(project)
    if transcript is None or not transcript.words:
        return None
    width, height = output_size(settings, *ffmpeg.probe(src).display_size)
    return build_ass(transcript.words, clip_start=clip.start, clip_end=clip.end,
                     settings=settings.captions, width=width, height=height)
    app = get_settings()
    vf = video_filter(settings, project.width or 0, project.height or 0)
    with storage.read_path(project.original_key) as src, storage.write_path(key) as dst:
        ffmpeg.cut_clip(src, dst, clip.start, clip.end, preset=app.export_preset,
                        crf=app.export_crf, video_filter=vf, on_progress=on_progress)
    return key


# --- tasks ---------------------------------------------------------------------

def ingest_project(job_id: str, project_id: str) -> None:
    """Probe the upload, extract audio, build the preview proxy and queue transcription."""

    def body(progress: ProgressReporter) -> None:
        settings = get_settings()
        storage = get_storage()
        project = _set_project(project_id, status=ProjectStatus.PROCESSING, error=None)

        progress.update(0, "Inspecting video", force=True)
        with storage.read_path(project.original_key) as src:
            info = ffmpeg.probe(src)
            if info.duration > settings.max_duration_seconds:
                raise ffmpeg.MediaError(
                    f"Video is {info.duration / 60:.0f} min long; "
                    f"the limit is {settings.max_duration_min:.0f} min."
                )
            project = _set_project(
                project_id,
                duration=info.duration, width=info.width, height=info.height, fps=info.fps,
                video_codec=info.video_codec, audio_codec=info.audio_codec,
                has_audio=info.has_audio,
            )

            if info.has_audio:
                with storage.write_path(project.audio_key) as dst:
                    ffmpeg.extract_audio(
                        src, dst, duration=info.duration,
                        on_progress=progress.stage(2, 15, "Extracting audio"),
                    )

            with storage.write_path(project.proxy_key) as dst:
                ffmpeg.make_proxy(
                    src, dst, max_height=settings.proxy_height, has_audio=info.has_audio,
                    duration=info.duration,
                    on_progress=progress.stage(15, 100, "Building preview"),
                )

        _set_project(project_id, status=ProjectStatus.READY)
        if info.has_audio:
            # Queue now (not after this job) so the UI sees it as soon as ingest finishes.
            with Session(get_engine()) as session:
                jobqueue.enqueue_job(session, jobqueue.get_queue(), project_id=project_id,
                                     job_type=JobType.TRANSCRIBE, func=transcribe_project)
        else:
            _save_transcript(project, Transcript.empty(info.duration))

    if not run_tracked(job_id, body):
        _mark_project_failed(project_id, job_id)


def _mark_project_failed(project_id: str, job_id: str) -> None:
    with Session(get_engine()) as session:
        job = session.get(Job, job_id)
        project = session.get(Project, project_id)
        if project is None:
            return
        project.status = ProjectStatus.FAILED
        project.error = (job.error if job else None) or "Processing failed"
        session.add(project)
        session.commit()


def transcribe_project(job_id: str, project_id: str) -> None:
    def body(progress: ProgressReporter) -> None:
        project = _get_project(project_id)
        _require_ready(project)
        ensure_transcript(project, progress.stage(0, 100, "Transcribing"))

    run_tracked(job_id, body)


def _replace_clips(project: Project, source: ClipSource, clips: list[Clip],
                   on_progress: Progress) -> list[Clip]:
    """Swap a project's clips of ``source`` for ``clips`` and render their thumbnails."""
    storage = get_storage()
    with Session(get_engine()) as session:
        old = session.exec(select(Clip).where(
            Clip.project_id == project.id, Clip.source == source)).all()
        for clip in old:
            storage.delete_prefix(clip.thumbs_prefix)
            storage.delete_prefix(clip.exports_prefix)
        session.exec(delete(Clip).where(Clip.project_id == project.id, Clip.source == source))
        session.add_all(clips)
        session.commit()
        for clip in clips:
            session.refresh(clip)

    with storage.read_path(project.proxy_key) as proxy:
        for i, clip in enumerate(clips):
            write_thumbnail(proxy, clip)
            on_progress((i + 1) / len(clips))
    on_progress(1.0)
    return clips


def write_thumbnail(proxy: Path, clip: Clip) -> None:
    with get_storage().write_path(clip.thumbnail_key) as dst:
        ffmpeg.extract_frame(proxy, dst, clip.thumbnail_at)


def generate_simple_clips(job_id: str, project_id: str, target_seconds: float) -> None:
    def body(progress: ProgressReporter) -> None:
        settings = get_settings()
        project = _get_project(project_id)
        _require_ready(project)

        progress.update(0, "Loading transcript", force=True)
        transcript = ensure_transcript(project, progress.stage(0, 80, "Transcribing (only needed once)"))

        progress.update(80, "Finding cut points", force=True)
        spans = plan_simple_clips(
            project.duration or transcript.duration, transcript.words, target_seconds,
            window=settings.snap_window_seconds, min_len=settings.min_clip_seconds,
        )
        clips = [
            Clip(project_id=project_id, source=ClipSource.SIMPLE, index=i + 1,
                 start=span.start, end=span.end, suggested_start=span.start,
                 suggested_end=span.end, text=transcript.text_between(span.start, span.end))
            for i, span in enumerate(spans)
        ]
        _replace_clips(project, ClipSource.SIMPLE, clips,
                       progress.stage(85, 100, "Creating thumbnails"))

    run_tracked(job_id, body)


def load_scene_cuts(project: Project, on_progress: Progress | None = None) -> list[float]:
    """Scene cuts of the video, detected once and cached as ``scenes.json``."""
    storage = get_storage()
    if storage.exists(project.scenes_key):
        with storage.open(project.scenes_key) as f:
            return json.loads(f.read())
    with storage.read_path(project.proxy_key) as proxy:
        cuts = detect_scene_cuts(proxy, duration=project.duration, on_progress=on_progress)
    with storage.write_path(project.scenes_key) as dst:
        dst.write_text(json.dumps(cuts))
    return cuts


def get_highlighter() -> HighlightFinder:
    """The Claude-backed highlight finder (replaced by a fake in tests)."""
    settings = get_settings()
    key = settings.anthropic_api_key.get_secret_value() if settings.anthropic_api_key else ""
    if not key:
        raise TaskError("AI highlights need a Claude API key. Add ANTHROPIC_API_KEY to your .env "
                        "file and restart Twapza.")
    return ClaudeHighlighter(api_key=key, model=settings.claude_model, effort=settings.claude_effort,
                             max_per_chunk=settings.highlights_per_chunk)


def generate_ai_clips(job_id: str, project_id: str) -> None:
    def body(progress: ProgressReporter) -> None:
        settings = get_settings()
        storage = get_storage()
        project = _get_project(project_id)
        _require_ready(project)
        finder = get_highlighter()  # fail fast on a missing key
        duration = project.duration or 0

        progress.update(0, "Loading transcript", force=True)
        transcript = ensure_transcript(project, progress.stage(0, 30, "Transcribing (only needed once)"))
        chunks = chunk_transcript(transcript, chunk_seconds=settings.highlight_chunk_seconds,
                                  overlap=settings.highlight_overlap_seconds)
        if not chunks:
            raise TaskError("AI highlights need speech, but no words were found in this video.")

        try:
            cuts = load_scene_cuts(project, progress.stage(30, 45, "Detecting scene changes"))
        except Exception:  # noqa: BLE001 - a nice-to-have signal; never fail the job on it
            log.exception("scene detection failed for %s", project_id)
            cuts = []

        progress.update(45, "Measuring audio energy", force=True)
        energy = None
        if project.has_audio and storage.exists(project.audio_key):
            with storage.read_path(project.audio_key) as wav:
                energy = energy_from_wav(wav).score

        candidates = ask_for_candidates(
            finder, chunks, video_title=project.filename, video_duration=duration,
            min_len=settings.highlight_min_seconds, max_len=settings.highlight_max_seconds,
            concurrency=settings.claude_concurrency,
            on_progress=progress.stage(50, 90, f"Claude is reviewing {len(chunks)} part(s) of the video"),
        )

        progress.update(90, "Ranking moments", force=True)
        best = build_highlights(
            candidates, words=transcript.words, scene_cuts=cuts, energy=energy, duration=duration,
            min_len=settings.highlight_min_seconds, max_len=settings.highlight_max_seconds,
            limit=settings.max_highlights,
        )
        if not best:
            raise TaskError("Claude didn't find any moments that would work as standalone clips.")

        clips = [
            Clip(project_id=project_id, source=ClipSource.AI, index=i + 1, start=c.start, end=c.end,
                 suggested_start=c.start, suggested_end=c.end,
                 text=transcript.text_between(c.start, c.end), title=c.title, hook=c.hook,
                 score=c.score, reason=c.reason)
            for i, c in enumerate(best)
        ]
        _replace_clips(project, ClipSource.AI, clips, progress.stage(92, 100, "Creating thumbnails"))

    run_tracked(job_id, body)


def export_clip(job_id: str, project_id: str, clip_id: str, settings_json: str) -> None:
    def body(progress: ProgressReporter) -> None:
        project = _get_project(project_id)
        clip = _clip(project_id, clip_id)
        settings = ExportSettings.model_validate_json(settings_json)
        render_export(project, clip, settings, progress.stage(0, 100, "Rendering clip"))

    run_tracked(job_id, body)


def export_zip(job_id: str, project_id: str, clip_ids: list[str], settings_json: str,
               zip_key: str) -> None:
    def body(progress: ProgressReporter) -> None:
        storage = get_storage()
        project = _get_project(project_id)
        settings = ExportSettings.model_validate_json(settings_json)
        clips = [_clip(project_id, cid) for cid in clip_ids]
        total = sum(c.duration for c in clips) or 1.0

        done = 0.0
        rendered: list[tuple[Clip, str]] = []
        for n, clip in enumerate(clips, start=1):
            start_pct = 95 * done / total
            end_pct = 95 * (done + clip.duration) / total
            stage = progress.stage(start_pct, end_pct, f"Rendering clip {n} of {len(clips)}")
            rendered.append((clip, render_export(project, clip, settings, stage)))
            done += clip.duration

        progress.update(95, "Creating ZIP", force=True)
        with storage.write_path(zip_key) as dst:
            # Video is already compressed: store, don't deflate.
            with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_STORED, allowZip64=True) as zf:
                for clip, key in rendered:
                    with storage.read_path(key) as path:
                        zf.write(path, arcname=export_filename(project, clip, settings))

    run_tracked(job_id, body)

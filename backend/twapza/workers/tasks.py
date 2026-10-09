"""RQ task entrypoints. Each takes plain string IDs so it is trivially serialisable."""

import logging
import zipfile
from collections.abc import Callable

from sqlmodel import Session, delete, select

from twapza import queue as jobqueue
from twapza import transcription
from twapza.clipping.simple import plan_simple_clips
from twapza.config import get_settings
from twapza.db.models import Clip, ClipSource, Job, JobType, Project, ProjectStatus
from twapza.db.session import get_engine
from twapza.exports import ExportSettings, export_filename, export_key
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
    video_filter = None
    if settings.upscale_1080:
        video_filter = ffmpeg.upscale_filter(project.width or 0, project.height or 0)
    with storage.read_path(project.original_key) as src, storage.write_path(key) as dst:
        ffmpeg.cut_clip(src, dst, clip.start, clip.end, preset=app.export_preset,
                        crf=app.export_crf, video_filter=video_filter, on_progress=on_progress)
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


def generate_simple_clips(job_id: str, project_id: str, target_seconds: float) -> None:
    def body(progress: ProgressReporter) -> None:
        settings = get_settings()
        storage = get_storage()
        project = _get_project(project_id)
        _require_ready(project)

        progress.update(0, "Loading transcript", force=True)
        transcript = ensure_transcript(project, progress.stage(0, 80, "Transcribing (only needed once)"))

        progress.update(80, "Finding cut points", force=True)
        spans = plan_simple_clips(
            project.duration or transcript.duration, transcript.words, target_seconds,
            window=settings.snap_window_seconds, min_len=settings.min_clip_seconds,
        )

        with Session(get_engine()) as session:
            old = session.exec(select(Clip).where(
                Clip.project_id == project_id, Clip.source == ClipSource.SIMPLE)).all()
            for clip in old:
                storage.delete(clip.thumbnail_key)
                storage.delete_prefix(clip.exports_prefix)
            session.exec(delete(Clip).where(
                Clip.project_id == project_id, Clip.source == ClipSource.SIMPLE))
            clips = [
                Clip(project_id=project_id, source=ClipSource.SIMPLE, index=i + 1,
                     start=span.start, end=span.end,
                     text=transcript.text_between(span.start, span.end))
                for i, span in enumerate(spans)
            ]
            session.add_all(clips)
            session.commit()
            for clip in clips:
                session.refresh(clip)

        thumbs = progress.stage(85, 100, "Creating thumbnails")
        with storage.read_path(project.proxy_key) as proxy:
            for i, clip in enumerate(clips):
                with storage.write_path(clip.thumbnail_key) as dst:
                    ffmpeg.extract_frame(proxy, dst, clip.start + min(1.0, clip.duration / 2))
                thumbs((i + 1) / len(clips))

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
                        zf.write(path, arcname=export_filename(project, clip))

    run_tracked(job_id, body)

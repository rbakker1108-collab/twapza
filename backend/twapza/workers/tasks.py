"""RQ task entrypoints. Each takes plain string IDs so it is trivially serialisable."""

from sqlmodel import Session

from twapza.config import get_settings
from twapza.db.models import Job, Project, ProjectStatus
from twapza.db.session import get_engine
from twapza.media import ffmpeg
from twapza.queue import ProgressReporter, run_tracked
from twapza.storage import get_storage


def _set_project(project_id: str, **fields) -> Project:
    with Session(get_engine()) as session:
        project = session.get(Project, project_id)
        if project is None:
            raise RuntimeError("Project no longer exists (it may have expired).")
        for name, value in fields.items():
            setattr(project, name, value)
        session.add(project)
        session.commit()
        session.refresh(project)
        return project


def ingest_project(job_id: str, project_id: str) -> None:
    """Probe the upload, then extract audio and build the preview proxy."""

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

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from rq import Queue
from sqlmodel import Session, select

from twapza.api.routes.projects import get_project_or_404, serve_object
from twapza.api.schemas import (
    ClipRead, ExportRequest, JobRead, SimpleClipsRequest, TrimRequest, ZipExportRequest,
)
from twapza.config import Settings, get_settings
from twapza.db.models import Clip, ClipSource, JobType, Project, ProjectStatus, new_id
from twapza.db.session import get_session
from twapza.exports import export_filename, export_key, zip_filename
from twapza.queue import completed_job, enqueue_job, get_queue
from twapza.storage import Storage, get_storage
from twapza.workers.tasks import (
    export_clip, export_zip, generate_ai_clips, generate_simple_clips, load_transcript,
    write_thumbnail,
)

MIN_TRIMMED_SECONDS = 3.0

router = APIRouter(prefix="/api", tags=["clips"])


def _ready_project(session: Session, project_id: str) -> Project:
    project = get_project_or_404(session, project_id)
    if project.status != ProjectStatus.READY:
        raise HTTPException(status.HTTP_409_CONFLICT, "The video has not finished processing yet.")
    return project


def _clip_or_404(session: Session, clip_id: str) -> Clip:
    clip = session.get(Clip, clip_id)
    if clip is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Clip not found.")
    return clip


@router.post("/projects/{project_id}/simple-clips", response_model=JobRead,
             status_code=status.HTTP_202_ACCEPTED)
def create_simple_clips(
    project_id: str,
    body: SimpleClipsRequest,
    session: Session = Depends(get_session),
    queue: Queue = Depends(get_queue),
) -> JobRead:
    _ready_project(session, project_id)
    job = enqueue_job(session, queue, project_id=project_id, job_type=JobType.SIMPLE_CLIPS,
                      func=generate_simple_clips, target_seconds=body.target_seconds)
    return JobRead.of(job)


@router.post("/projects/{project_id}/ai-clips", response_model=JobRead,
             status_code=status.HTTP_202_ACCEPTED)
def create_ai_clips(
    project_id: str,
    session: Session = Depends(get_session),
    queue: Queue = Depends(get_queue),
    settings: Settings = Depends(get_settings),
) -> JobRead:
    _ready_project(session, project_id)
    if not settings.anthropic_api_key or not settings.anthropic_api_key.get_secret_value():
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "AI highlights need a Claude API key. Add ANTHROPIC_API_KEY to your "
                            ".env file and restart Twapza.")
    job = enqueue_job(session, queue, project_id=project_id, job_type=JobType.AI_CLIPS,
                      func=generate_ai_clips)
    return JobRead.of(job)


@router.patch("/clips/{clip_id}", response_model=ClipRead)
async def trim_clip(
    clip_id: str,
    body: TrimRequest,
    session: Session = Depends(get_session),
    storage: Storage = Depends(get_storage),
    settings: Settings = Depends(get_settings),
) -> ClipRead:
    """Change a clip's start/end (the trim slider). Exports of the new range render fresh."""
    clip = _clip_or_404(session, clip_id)
    project = _ready_project(session, clip.project_id)
    duration = project.duration or 0
    start, end = round(body.start, 3), round(min(body.end, duration), 3)
    if start >= end:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The clip must end after it starts.")
    if end - start < MIN_TRIMMED_SECONDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"A clip must be at least {MIN_TRIMMED_SECONDS:g} seconds long.")
    if end - start > settings.max_clip_seconds:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"A clip can be at most {settings.max_clip_seconds:g} seconds long.")

    clip.start, clip.end = start, end
    transcript = await run_in_threadpool(load_transcript, project)
    if transcript is not None:
        clip.text = transcript.text_between(start, end)
    session.add(clip)
    session.commit()
    session.refresh(clip)
    if not storage.exists(clip.thumbnail_key):
        await run_in_threadpool(_render_thumbnail, storage, project, clip)
    return ClipRead.of(clip)


def _render_thumbnail(storage: Storage, project: Project, clip: Clip) -> None:
    with storage.read_path(project.proxy_key) as proxy:
        write_thumbnail(proxy, clip)


@router.get("/projects/{project_id}/clips", response_model=list[ClipRead])
def list_clips(
    project_id: str,
    source: ClipSource | None = None,
    session: Session = Depends(get_session),
) -> list[ClipRead]:
    get_project_or_404(session, project_id)
    query = select(Clip).where(Clip.project_id == project_id)
    if source:
        query = query.where(Clip.source == source)
    # AI clips are stored best-first, so index order is also rank order.
    clips = session.exec(query.order_by(Clip.source, Clip.index)).all()
    return [ClipRead.of(c) for c in clips]


@router.get("/clips/{clip_id}/thumbnail")
def clip_thumbnail(
    clip_id: str,
    session: Session = Depends(get_session),
    storage: Storage = Depends(get_storage),
) -> Response:
    clip = _clip_or_404(session, clip_id)
    if not storage.exists(clip.thumbnail_key):  # e.g. right after a trim, or an older clip
        project = get_project_or_404(session, clip.project_id)
        _render_thumbnail(storage, project, clip)
    return serve_object(storage, clip.thumbnail_key, "image/jpeg")


@router.post("/clips/{clip_id}/export", response_model=JobRead, status_code=status.HTTP_202_ACCEPTED)
def create_export(
    clip_id: str,
    body: ExportRequest,
    session: Session = Depends(get_session),
    storage: Storage = Depends(get_storage),
    queue: Queue = Depends(get_queue),
) -> JobRead:
    clip = _clip_or_404(session, clip_id)
    project = _ready_project(session, clip.project_id)
    key = export_key(clip, body.settings)
    name = export_filename(project, clip, body.settings)
    if storage.exists(key):
        job = completed_job(session, project_id=project.id, job_type=JobType.EXPORT,
                            result_key=key, result_name=name)
    else:
        job = enqueue_job(session, queue, project_id=project.id, job_type=JobType.EXPORT,
                          func=export_clip, result_key=key, result_name=name,
                          clip_id=clip.id, settings_json=body.settings.model_dump_json())
    return JobRead.of(job)


@router.post("/projects/{project_id}/export-zip", response_model=JobRead,
             status_code=status.HTTP_202_ACCEPTED)
def create_zip_export(
    project_id: str,
    body: ZipExportRequest,
    session: Session = Depends(get_session),
    queue: Queue = Depends(get_queue),
) -> JobRead:
    project = _ready_project(session, project_id)
    query = select(Clip).where(Clip.project_id == project_id, Clip.source == body.source)
    if body.clip_ids is not None:
        query = query.where(Clip.id.in_(body.clip_ids))
    clips = session.exec(query.order_by(Clip.index)).all()
    if not clips:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "There are no clips to export.")
    zip_key = f"{project.prefix}zips/{new_id()}.zip"
    job = enqueue_job(session, queue, project_id=project_id, job_type=JobType.EXPORT_ZIP,
                      func=export_zip, result_key=zip_key, result_name=zip_filename(project),
                      clip_ids=[c.id for c in clips], settings_json=body.settings.model_dump_json(),
                      zip_key=zip_key)
    return JobRead.of(job)

"""Import a video from a YouTube link (the alternative to uploading a file).

``POST /api/imports`` (with ``rights_confirmed: true``) creates a project and queues an
``import`` job that downloads the video with yt-dlp and then starts the usual ingest.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from rq import Queue
from sqlmodel import Session

from twapza.api.routes.uploads import RIGHTS_REQUIRED
from twapza.api.schemas import CompleteUploadResponse, CreateImport, JobRead, ProjectRead
from twapza.config import Settings, get_settings
from twapza.db.models import JobType, Project, ProjectStatus, utcnow
from twapza.db.session import get_session
from twapza.importing.youtube import canonical_url, youtube_video_id
from twapza.queue import enqueue_job, get_queue
from twapza.workers.tasks import import_youtube

router = APIRouter(prefix="/api/imports", tags=["imports"])

NOT_A_VIDEO_LINK = ("That doesn't look like a YouTube video link. Paste a link like "
                    "https://www.youtube.com/watch?v=… or https://youtu.be/….")


@router.post("", response_model=CompleteUploadResponse, status_code=status.HTTP_201_CREATED)
def create_import(
    body: CreateImport,
    session: Session = Depends(get_session),
    queue: Queue = Depends(get_queue),
    settings: Settings = Depends(get_settings),
) -> CompleteUploadResponse:
    if not settings.youtube_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Importing from YouTube is turned off.")
    if not body.rights_confirmed:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, RIGHTS_REQUIRED)
    video_id = youtube_video_id(body.url)
    if video_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, NOT_A_VIDEO_LINK)

    url = canonical_url(video_id)
    now = utcnow()
    project = Project(
        filename="YouTube video.mp4",  # replaced by the video's title once it is looked up
        ext="mp4",
        size_bytes=0,
        chunk_size=0,
        total_chunks=0,
        status=ProjectStatus.QUEUED,
        source_url=url,
        rights_confirmed_at=now,
        created_at=now,
        expires_at=now + timedelta(hours=settings.retention_hours),
    )
    session.add(project)
    session.commit()

    job = enqueue_job(session, queue, project_id=project.id, job_type=JobType.IMPORT,
                      func=import_youtube, url=url)
    session.refresh(project)
    return CompleteUploadResponse(project=ProjectRead.of(project, [job]), job=JobRead.of(job))

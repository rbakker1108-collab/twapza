from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlalchemy import func
from sqlmodel import Session, select

from twapza.api.schemas import ProjectRead, ProjectSummary
from twapza.db.models import Clip, Job, JobStatus, Project, utcnow
from twapza.db.session import get_session
from twapza.storage import Storage, get_storage

router = APIRouter(prefix="/api/projects", tags=["projects"])


def get_project_or_404(session: Session, project_id: str) -> Project:
    project = session.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found (it may have expired).")
    return project


def serve_object(storage: Storage, key: str, media_type: str, download_name: str | None = None) -> Response:
    """Serve a stored object, with HTTP Range support for video seeking."""
    url = storage.presigned_url(key)
    if url:
        return RedirectResponse(url)
    path = storage.local_file(key)
    if path is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not available.")
    return FileResponse(path, media_type=media_type, filename=download_name,
                        content_disposition_type="attachment" if download_name else "inline")


@router.get("", response_model=list[ProjectSummary])
def list_projects(session: Session = Depends(get_session), limit: int = 50) -> list[ProjectSummary]:
    """Recent projects that haven't expired yet, newest first."""
    projects = session.exec(
        select(Project).where(Project.expires_at > utcnow())
        .order_by(Project.created_at.desc()).limit(max(1, min(limit, 200)))
    ).all()
    counts = dict(session.exec(
        select(Clip.project_id, func.count()).where(Clip.project_id.in_([p.id for p in projects]))
        .group_by(Clip.project_id)
    ).all())
    return [ProjectSummary(id=p.id, filename=p.filename, status=p.status, created_at=p.created_at,
                           expires_at=p.expires_at, duration=p.duration, clip_count=counts.get(p.id, 0))
            for p in projects]


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_now(
    project_id: str,
    session: Session = Depends(get_session),
    storage: Storage = Depends(get_storage),
) -> None:
    """Delete a project and all its files immediately (instead of waiting for expiry)."""
    from twapza.cleanup import delete_project

    project = get_project_or_404(session, project_id)
    # Stop anything still running for it; workers notice at their next progress update.
    for job in session.exec(select(Job).where(Job.project_id == project_id)).all():
        if not job.status.is_terminal:
            job.status = JobStatus.CANCELED
            session.add(job)
    session.commit()
    delete_project(session, storage, project)
    session.commit()


@router.get("/{project_id}", response_model=ProjectRead)
def get_project(project_id: str, session: Session = Depends(get_session)) -> ProjectRead:
    project = get_project_or_404(session, project_id)
    jobs = session.exec(select(Job).where(Job.project_id == project_id).order_by(Job.created_at)).all()
    return ProjectRead.of(project, list(jobs))


@router.get("/{project_id}/proxy")
def get_proxy(
    project_id: str,
    session: Session = Depends(get_session),
    storage: Storage = Depends(get_storage),
) -> Response:
    project = get_project_or_404(session, project_id)
    return serve_object(storage, project.proxy_key, "video/mp4")


@router.get("/{project_id}/transcript")
def get_transcript(
    project_id: str,
    session: Session = Depends(get_session),
    storage: Storage = Depends(get_storage),
) -> Response:
    project = get_project_or_404(session, project_id)
    if not storage.exists(project.transcript_key):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "The transcript is not ready yet.")
    return serve_object(storage, project.transcript_key, "application/json")

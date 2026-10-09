from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlmodel import Session, select

from twapza.api.schemas import ProjectRead
from twapza.db.models import Job, Project
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

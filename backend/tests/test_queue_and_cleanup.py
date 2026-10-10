from datetime import timedelta

from sqlmodel import Session, select

from twapza.cleanup import cleanup_expired
from twapza.db.models import Job, JobStatus, JobType, Project, utcnow
from twapza.db.session import get_engine
from twapza.queue import ProgressReporter, run_tracked
from twapza.storage import get_storage


def make_project(**overrides) -> Project:
    now = utcnow()
    project = Project(
        filename="a.mp4", ext="mp4", size_bytes=1, chunk_size=1, total_chunks=1,
        rights_confirmed_at=now, expires_at=now + timedelta(hours=24), **overrides,
    )
    with Session(get_engine()) as s:
        s.add(project)
        s.commit()
        s.refresh(project)
    return project


def make_job(project: Project) -> str:
    with Session(get_engine()) as s:
        job = Job(project_id=project.id, type=JobType.INGEST)
        s.add(job)
        s.commit()
        return job.id


def load_job(job_id: str) -> Job:
    with Session(get_engine()) as s:
        return s.get(Job, job_id)


def test_run_tracked_success_records_progress():
    job_id = make_job(make_project())
    seen = []

    def body(progress: ProgressReporter):
        progress.update(10, "Working", force=True)
        seen.append(load_job(job_id).progress)
        progress.stage(10, 50)(0.5)  # throttled: same message, too soon
        progress.update(40, force=True)
        seen.append(load_job(job_id).progress)

    assert run_tracked(job_id, body)
    job = load_job(job_id)
    assert seen == [10, 40]
    assert job.status == JobStatus.SUCCEEDED
    assert job.progress == 100
    assert job.started_at and job.finished_at


def test_run_tracked_failure_is_recorded_not_raised():
    job_id = make_job(make_project())

    def body(_progress):
        raise ValueError("bad things")

    assert run_tracked(job_id, body) is False
    job = load_job(job_id)
    assert job.status == JobStatus.FAILED
    assert job.error == "Something went wrong: bad things"


def test_stage_maps_fraction_to_range():
    job_id = make_job(make_project())
    reporter = ProgressReporter(job_id, min_interval=0)
    cb = reporter.stage(20, 60, "Encoding")
    assert load_job(job_id).message == "Encoding"
    cb(0.5)
    assert load_job(job_id).progress == 40


def test_cleanup_removes_only_expired_projects():
    storage = get_storage()
    old = make_project()
    fresh = make_project()
    make_job(old)
    for p in (old, fresh):
        with storage.write_path(p.original_key) as path:
            path.write_bytes(b"video")

    with Session(get_engine()) as s:
        row = s.get(Project, old.id)
        row.expires_at = utcnow() - timedelta(minutes=1)
        s.add(row)
        s.commit()

    assert cleanup_expired() == 1
    assert not storage.exists(old.original_key)
    assert storage.exists(fresh.original_key)
    with Session(get_engine()) as s:
        assert s.get(Project, old.id) is None
        assert s.exec(select(Job).where(Job.project_id == old.id)).all() == []
        assert s.get(Project, fresh.id) is not None

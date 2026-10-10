"""Stage 5: cancellation, stale-job watchdog, error messages, project management, cleanup."""

import errno
import os
import subprocess
import time
from datetime import timedelta

import pytest
from fakeredis import FakeRedis
from rq import Queue
from rq.job import JobStatus as RQStatus
from sqlmodel import Session, select

from tests.conftest import make_test_video, requires_ffmpeg, upload_file
from twapza.cleanup import sweep_orphans
from twapza.db.models import Clip, ClipSource, Job, JobStatus, JobType, Project, ProjectStatus, utcnow
from twapza.db.session import get_engine
from twapza.queue import (
    LOST_WORKER_MESSAGE, JobCanceled, ProgressReporter, cancel_job, reap_stale_jobs, run_tracked,
    user_message,
)
from twapza.storage import get_storage


def make_project(**over) -> Project:
    now = utcnow()
    fields = dict(filename="a.mp4", ext="mp4", size_bytes=1, chunk_size=1, total_chunks=1,
                  rights_confirmed_at=now, expires_at=now + timedelta(hours=24)) | over
    p = Project(**fields)
    with Session(get_engine()) as s:
        s.add(p)
        s.commit()
        s.refresh(p)
    return p


def make_job(project_id, **over) -> Job:
    job = Job(project_id=project_id, type=over.pop("type", JobType.SIMPLE_CLIPS), **over)
    with Session(get_engine()) as s:
        s.add(job)
        s.commit()
        s.refresh(job)
    return job


def load(job_id) -> Job:
    with Session(get_engine()) as s:
        return s.get(Job, job_id)


def set_status(job_id, status):
    with Session(get_engine()) as s:
        job = s.get(Job, job_id)
        job.status = status
        s.add(job)
        s.commit()


# --- cancellation -----------------------------------------------------------------

def test_job_canceled_before_start_never_runs():
    job = make_job(make_project().id, status=JobStatus.CANCELED)
    ran = []
    assert run_tracked(job.id, lambda p: ran.append(1)) is False
    assert ran == [] and load(job.id).status == JobStatus.CANCELED


def test_job_canceled_while_running_stops_at_next_progress_update():
    job = make_job(make_project().id)
    steps = []

    def body(progress: ProgressReporter):
        progress.update(10, "Working", force=True)
        steps.append("first")
        set_status(job.id, JobStatus.CANCELED)  # the user clicks Cancel
        progress.update(50, force=True)
        steps.append("never reached")

    assert run_tracked(job.id, body) is False
    assert steps == ["first"]
    done = load(job.id)
    assert done.status == JobStatus.CANCELED and done.message == "Canceled" and done.finished_at


def test_deleted_job_also_stops_work():
    project = make_project()
    job = make_job(project.id)
    reporter = ProgressReporter(job.id)
    with Session(get_engine()) as s:
        s.delete(s.get(Job, job.id))
        s.commit()
    with pytest.raises(JobCanceled):
        reporter.update(5, force=True)


def test_cancel_job_removes_queued_rq_job():
    queue = Queue("t", connection=FakeRedis())
    project = make_project()
    job = make_job(project.id)
    queue.enqueue(print, "x", job_id=job.id)
    with Session(get_engine()) as s:
        canceled = cancel_job(s, s.get(Job, job.id), queue)
    assert canceled.status == JobStatus.CANCELED
    assert job.id not in queue.job_ids
    # Canceling a finished job is a no-op
    finished = make_job(project.id, status=JobStatus.SUCCEEDED)
    with Session(get_engine()) as s:
        assert cancel_job(s, s.get(Job, finished.id), queue).status == JobStatus.SUCCEEDED


@requires_ffmpeg
def test_cancel_kills_ffmpeg(tmp_path, monkeypatch):
    from twapza.media import ffmpeg

    started = []
    real_popen = subprocess.Popen

    def recording_popen(*args, **kwargs):
        proc = real_popen(*args, **kwargs)
        if "-progress" in args[0]:  # only the encode, not probes / test-video generation
            started.append(proc)
        return proc

    monkeypatch.setattr(ffmpeg.subprocess, "Popen", recording_popen)
    src = make_test_video(tmp_path / "in.mp4", seconds=20)

    def on_progress(fraction):
        if fraction > 0:
            raise JobCanceled()

    with pytest.raises(JobCanceled):
        ffmpeg.cut_clip(src, tmp_path / "out.mp4", 0, 20, preset="veryslow", on_progress=on_progress)
    [proc] = started
    assert proc.poll() is not None  # the ffmpeg process was killed and reaped, not left running


def test_canceling_ai_run_does_not_wait_for_remaining_chunks():
    from twapza.clipping.highlights import ask_for_candidates
    from twapza.clipping.llm import Line, chunk_lines

    class Slow:
        def find(self, chunk, **_):
            time.sleep(0.05 if chunk.index == 0 else 2.0)
            return '{"clips": []}'

    def on_progress(_):
        raise JobCanceled()

    chunks = chunk_lines([Line(t, t + 5, "x.") for t in range(0, 600, 10)], chunk_seconds=100, overlap=0)
    t0 = time.monotonic()
    with pytest.raises(JobCanceled):
        ask_for_candidates(Slow(), chunks, video_title="v", video_duration=600, concurrency=2,
                           on_progress=on_progress)
    assert time.monotonic() - t0 < 1.0


# --- error messages ---------------------------------------------------------------------

def test_user_messages():
    from twapza.clipping.llm import HighlightError
    from twapza.media.ffmpeg import MediaError
    from twapza.workers.tasks import TaskError

    assert "disk space" in user_message(OSError(errno.ENOSPC, "No space left on device"))
    assert user_message(MediaError("Video is too long.")) == "Video is too long."
    assert user_message(TaskError("Project gone.")) == "Project gone."
    assert user_message(HighlightError("Key rejected.")) == "Key rejected."
    assert user_message(KeyError("x")).startswith("Something went wrong")


# --- stale job watchdog -----------------------------------------------------------------

def rq_job(conn, job_id, status, heartbeat=None):
    from rq.job import Job as RQJob

    job = RQJob.create(print, id=job_id, connection=conn)
    job.set_status(status)
    if heartbeat is not None:
        job.last_heartbeat = heartbeat
    job.save()
    return job


def test_watchdog_fails_jobs_whose_worker_is_gone():
    conn = FakeRedis()
    now = utcnow()
    project = make_project(status=ProjectStatus.PROCESSING)
    old = now - timedelta(minutes=10)
    jobs = {
        "missing_old": make_job(project.id, status=JobStatus.QUEUED, created_at=old),
        "missing_new": make_job(project.id, status=JobStatus.QUEUED, created_at=now),
        "rq_failed": make_job(project.id, status=JobStatus.RUNNING, created_at=old),
        "stale_heartbeat": make_job(project.id, status=JobStatus.RUNNING, created_at=old, type=JobType.INGEST),
        "healthy": make_job(project.id, status=JobStatus.RUNNING, created_at=old),
        "queued_ok": make_job(project.id, status=JobStatus.QUEUED, created_at=old),
        "done": make_job(project.id, status=JobStatus.SUCCEEDED, created_at=old),
    }
    rq_job(conn, jobs["rq_failed"].id, RQStatus.FAILED)
    rq_job(conn, jobs["stale_heartbeat"].id, RQStatus.STARTED, heartbeat=now - timedelta(minutes=10))
    rq_job(conn, jobs["healthy"].id, RQStatus.STARTED, heartbeat=now - timedelta(seconds=20))
    rq_job(conn, jobs["queued_ok"].id, RQStatus.QUEUED)

    assert reap_stale_jobs(conn, now=now) == 3
    status = {k: load(j.id).status for k, j in jobs.items()}
    assert status == {
        "missing_old": JobStatus.FAILED, "missing_new": JobStatus.QUEUED, "rq_failed": JobStatus.FAILED,
        "stale_heartbeat": JobStatus.FAILED, "healthy": JobStatus.RUNNING, "queued_ok": JobStatus.QUEUED,
        "done": JobStatus.SUCCEEDED,
    }
    assert load(jobs["rq_failed"].id).error == LOST_WORKER_MESSAGE
    with Session(get_engine()) as s:  # a lost ingest job fails its project
        assert s.get(Project, project.id).status == ProjectStatus.FAILED


# --- project management API -----------------------------------------------------------------

def test_cancel_endpoint(client):
    project = make_project()
    running = make_job(project.id, status=JobStatus.RUNNING)
    ingest = make_job(project.id, type=JobType.INGEST, status=JobStatus.RUNNING)
    done = make_job(project.id, status=JobStatus.SUCCEEDED)
    r = client.post(f"/api/jobs/{running.id}/cancel")
    assert r.status_code == 200 and r.json()["status"] == "canceled"
    assert client.post(f"/api/jobs/{ingest.id}/cancel").status_code == 409
    assert client.post(f"/api/jobs/{done.id}/cancel").status_code == 409
    assert client.post("/api/jobs/nope/cancel").status_code == 404


def test_list_projects_newest_first_without_expired(client):
    a = make_project(filename="first.mp4", created_at=utcnow() - timedelta(hours=2))
    b = make_project(filename="second.mp4")
    make_project(filename="expired.mp4", expires_at=utcnow() - timedelta(minutes=1))
    with Session(get_engine()) as s:
        s.add(Clip(project_id=a.id, source=ClipSource.SIMPLE, index=1, start=0, end=30))
        s.add(Clip(project_id=a.id, source=ClipSource.AI, index=1, start=0, end=30))
        s.commit()
    listed = client.get("/api/projects").json()
    assert [p["filename"] for p in listed] == ["second.mp4", "first.mp4"]
    assert [p["clip_count"] for p in listed] == [0, 2]
    assert listed[0]["id"] == b.id


@requires_ffmpeg
def test_delete_project_removes_everything(client, sample_video, isolated_env):
    pid = upload_file(client, sample_video)["project"]["id"]
    folder = isolated_env / "storage" / "projects" / pid
    assert folder.exists()
    assert client.delete(f"/api/projects/{pid}").status_code == 204
    assert not folder.exists()
    assert client.get(f"/api/projects/{pid}").status_code == 404
    with Session(get_engine()) as s:
        assert s.exec(select(Job).where(Job.project_id == pid)).all() == []
    assert client.delete(f"/api/projects/{pid}").status_code == 404


# --- orphan sweep ----------------------------------------------------------------------------

def test_sweep_orphans_removes_only_old_unknown_folders():
    storage = get_storage()
    known = make_project()
    for name in (known.id, "orphan-old", "orphan-new"):
        with storage.write_path(f"projects/{name}/original.mp4") as p:
            p.write_bytes(b"x")
    old = time.time() - 7200
    root = storage.local_file(f"projects/{known.id}/original.mp4").parents[1]
    for name in (known.id, "orphan-old"):
        os.utime(root / name, (old, old))
    assert sweep_orphans() == 1
    assert storage.exists(f"projects/{known.id}/original.mp4")
    assert not storage.exists("projects/orphan-old/original.mp4")
    assert storage.exists("projects/orphan-new/original.mp4")  # might be an upload starting now

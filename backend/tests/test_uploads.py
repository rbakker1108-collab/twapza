from pathlib import Path

from tests.conftest import requires_ffmpeg

MB = 1024 * 1024  # tests run with TWAPZA_CHUNK_SIZE_MB=1


def create(client, **overrides):
    body = {"filename": "talk.mp4", "size_bytes": 10, "rights_confirmed": True} | overrides
    return client.post("/api/uploads", json=body)


def upload_file(client, path: Path, filename: str | None = None) -> dict:
    data = path.read_bytes()
    r = create(client, filename=filename or path.name, size_bytes=len(data))
    assert r.status_code == 201, r.text
    session = r.json()
    size = session["chunk_size"]
    for i in range(session["total_chunks"]):
        put = client.put(f"/api/uploads/{session['project_id']}/chunks/{i}",
                         content=data[i * size:(i + 1) * size])
        assert put.status_code == 204, put.text
    done = client.post(f"/api/uploads/{session['project_id']}/complete")
    assert done.status_code == 200, done.text
    return done.json()


def test_rights_checkbox_is_required(client):
    r = create(client, rights_confirmed=False)
    assert r.status_code == 400
    assert "permission" in r.json()["detail"]


def test_rights_field_must_be_present(client):
    r = client.post("/api/uploads", json={"filename": "a.mp4", "size_bytes": 10})
    assert r.status_code == 422


def test_rejects_unsupported_extension(client):
    r = create(client, filename="clip.avi")
    assert r.status_code == 400
    assert ".mp4" in r.json()["detail"]


def test_rejects_too_large(client, monkeypatch):
    r = create(client, size_bytes=21 * 1024**3)
    assert r.status_code == 413


def test_filename_path_components_are_stripped(client):
    r = create(client, filename="../../etc/My Talk.MOV")
    assert r.status_code == 201
    project = client.get(f"/api/projects/{r.json()['project_id']}").json()
    assert project["filename"] == "My Talk.MOV"
    assert project["status"] == "uploading"
    assert project["rights_confirmed_at"].endswith(("Z", "+00:00"))


def test_chunk_validation_and_resume(client):
    r = create(client, size_bytes=MB + 5)
    session = r.json()
    pid = session["project_id"]
    assert session["total_chunks"] == 2

    assert client.put(f"/api/uploads/{pid}/chunks/2", content=b"x").status_code == 400
    assert client.put(f"/api/uploads/{pid}/chunks/1", content=b"toolong").status_code == 400
    assert client.put(f"/api/uploads/{pid}/chunks/1", content=b"12345").status_code == 204
    # idempotent re-upload of the same chunk
    assert client.put(f"/api/uploads/{pid}/chunks/1", content=b"12345").status_code == 204

    assert client.get(f"/api/uploads/{pid}").json()["received_chunks"] == [1]
    incomplete = client.post(f"/api/uploads/{pid}/complete")
    assert incomplete.status_code == 409
    assert incomplete.json()["detail"]["missing_chunks"] == [0]


def test_unknown_upload_is_404(client):
    assert client.get("/api/uploads/nope").status_code == 404


@requires_ffmpeg
def test_full_upload_runs_ingest_job(client, sample_video, isolated_env):
    result = upload_file(client, sample_video)
    pid = result["project"]["id"]
    job_id = result["job"]["id"]

    # The sync queue ran the ingest job inline.
    job = client.get(f"/api/jobs/{job_id}").json()
    assert job["status"] == "succeeded", job
    assert job["progress"] == 100

    project = client.get(f"/api/projects/{pid}").json()
    assert project["status"] == "ready"
    assert abs(project["duration"] - 3) < 0.2
    assert (project["width"], project["height"]) == (320, 240)
    assert project["has_audio"] is True

    # Original preserved byte-for-byte; proxy and audio are new files.
    storage_root = isolated_env / "storage" / "projects" / pid
    assert (storage_root / "original.mp4").read_bytes() == sample_video.read_bytes()
    assert (storage_root / "audio.wav").stat().st_size > 0

    proxy = client.get(f"/api/projects/{pid}/proxy")
    assert proxy.status_code == 200
    assert proxy.headers["content-type"] == "video/mp4"
    partial = client.get(f"/api/projects/{pid}/proxy", headers={"Range": "bytes=0-99"})
    assert partial.status_code == 206
    assert len(partial.content) == 100

    # SSE stream emits the terminal state and closes.
    events = client.get(f"/api/jobs/{job_id}/events")
    assert events.headers["content-type"].startswith("text/event-stream")
    assert '"status":"succeeded"' in events.text


@requires_ffmpeg
def test_invalid_media_marks_project_failed(client, tmp_path):
    bogus = tmp_path / "bogus.mp4"
    bogus.write_bytes(b"this is not a video" * 100)
    result = upload_file(client, bogus)
    pid = result["project"]["id"]
    job = client.get(f"/api/jobs/{result['job']['id']}").json()
    assert job["status"] == "failed"
    assert job["error"]
    project = client.get(f"/api/projects/{pid}").json()
    assert project["status"] == "failed"
    assert project["error"]

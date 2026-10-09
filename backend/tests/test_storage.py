import pytest

from twapza.storage import LocalStorage, StorageError


@pytest.fixture
def storage(tmp_path):
    return LocalStorage(tmp_path / "store")


def test_chunked_upload_writes_parts_at_offsets_in_any_order(storage):
    key = "projects/abc/original.mp4"
    storage.begin_upload(key, 10)
    storage.write_part(key, 5, b"FGHIJ")
    storage.write_part(key, 0, b"ABCDE")
    assert not storage.exists(key)  # not visible until completed
    storage.complete_upload(key)
    with storage.open(key) as f:
        assert f.read() == b"ABCDEFGHIJ"


def test_abort_upload_removes_partial(storage):
    key = "projects/abc/original.mp4"
    storage.begin_upload(key, 4)
    storage.abort_upload(key)
    with pytest.raises(StorageError):
        storage.write_part(key, 0, b"x")


@pytest.mark.parametrize("key", ["../etc/passwd", "/abs/path", "a/../../b", "a//b", "", "a\\b"])
def test_rejects_unsafe_keys(storage, key):
    with pytest.raises(StorageError):
        storage.exists(key)


def test_write_path_is_atomic(storage):
    key = "projects/abc/proxy.mp4"
    with pytest.raises(RuntimeError):
        with storage.write_path(key) as p:
            p.write_bytes(b"half")
            raise RuntimeError("encoder crashed")
    assert not storage.exists(key)

    with storage.write_path(key) as p:
        p.write_bytes(b"done")
    assert storage.size(key) == 4
    assert storage.local_file(key) is not None


def test_delete_prefix(storage):
    with storage.write_path("projects/abc/a.bin") as p:
        p.write_bytes(b"1")
    with storage.write_path("projects/abc/sub/b.bin") as p:
        p.write_bytes(b"2")
    with storage.write_path("projects/keep/c.bin") as p:
        p.write_bytes(b"3")
    storage.delete_prefix("projects/abc/")
    assert not storage.exists("projects/abc/a.bin")
    assert not storage.exists("projects/abc/sub/b.bin")
    assert storage.exists("projects/keep/c.bin")

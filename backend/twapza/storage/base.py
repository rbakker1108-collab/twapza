"""Storage abstraction.

Everything Twapza persists (originals, proxies, audio, clips) is addressed by a
string *key* such as ``projects/<id>/original.mp4``. Backends map keys to real
locations. ffmpeg needs real files, so backends expose ``read_path`` /
``write_path`` context managers: the local backend yields the real path, a
future S3 backend would download to / upload from a temp file.
"""

from contextlib import AbstractContextManager
from pathlib import Path
from typing import BinaryIO, Protocol


class StorageError(Exception):
    pass


def validate_key(key: str) -> str:
    if not key or key.startswith("/") or "\\" in key:
        raise StorageError(f"invalid storage key: {key!r}")
    if any(part in ("", ".", "..") for part in key.split("/")):
        raise StorageError(f"invalid storage key: {key!r}")
    return key


class Storage(Protocol):
    # --- chunked (multipart) uploads -------------------------------------
    def begin_upload(self, key: str, size: int) -> None: ...

    def write_part(self, key: str, offset: int, data: bytes) -> None: ...

    def complete_upload(self, key: str) -> None: ...

    def abort_upload(self, key: str) -> None: ...

    # --- objects -----------------------------------------------------------
    def exists(self, key: str) -> bool: ...

    def size(self, key: str) -> int: ...

    def open(self, key: str) -> BinaryIO: ...

    def read_path(self, key: str) -> AbstractContextManager[Path]: ...

    def write_path(self, key: str) -> AbstractContextManager[Path]: ...

    def delete(self, key: str) -> None: ...

    def delete_prefix(self, prefix: str) -> None: ...

    def local_file(self, key: str) -> Path | None:
        """Real filesystem path if the backend has one (used for FileResponse)."""
        ...

    def presigned_url(self, key: str) -> str | None:
        """Direct download URL if the backend supports it (e.g. S3)."""
        ...

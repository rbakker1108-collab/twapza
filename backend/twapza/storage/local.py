import os
import shutil
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import BinaryIO

from twapza.storage.base import StorageError, validate_key

PARTIAL_SUFFIX = ".part"


class LocalStorage:
    """Stores objects as files under ``root``."""

    def __init__(self, root: Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / validate_key(key)).resolve()
        if not path.is_relative_to(self.root):
            raise StorageError(f"key escapes storage root: {key!r}")
        return path

    def _partial(self, key: str) -> Path:
        path = self._path(key)
        return path.with_name(path.name + PARTIAL_SUFFIX)

    # --- chunked uploads ---------------------------------------------------
    def begin_upload(self, key: str, size: int) -> None:
        partial = self._partial(key)
        partial.parent.mkdir(parents=True, exist_ok=True)
        with open(partial, "wb") as f:
            f.truncate(size)

    def write_part(self, key: str, offset: int, data: bytes) -> None:
        partial = self._partial(key)
        if not partial.exists():
            raise StorageError(f"no upload in progress for {key!r}")
        with open(partial, "r+b") as f:
            f.seek(offset)
            f.write(data)

    def complete_upload(self, key: str) -> None:
        partial = self._partial(key)
        if not partial.exists():
            raise StorageError(f"no upload in progress for {key!r}")
        os.replace(partial, self._path(key))

    def abort_upload(self, key: str) -> None:
        self._partial(key).unlink(missing_ok=True)

    # --- objects -------------------------------------------------------------
    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def size(self, key: str) -> int:
        return self._path(key).stat().st_size

    def open(self, key: str) -> BinaryIO:
        return open(self._path(key), "rb")

    @contextmanager
    def read_path(self, key: str) -> Iterator[Path]:
        path = self._path(key)
        if not path.is_file():
            raise StorageError(f"object not found: {key!r}")
        yield path

    @contextmanager
    def write_path(self, key: str) -> Iterator[Path]:
        """Yield a temp path to write to; it is moved into place on success."""
        final = self._path(key)
        final.parent.mkdir(parents=True, exist_ok=True)
        tmp = final.with_name(f".{final.name}.tmp")
        tmp.unlink(missing_ok=True)
        try:
            yield tmp
            if not tmp.exists():
                raise StorageError(f"nothing was written for {key!r}")
            os.replace(tmp, final)
        finally:
            tmp.unlink(missing_ok=True)

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def delete_prefix(self, prefix: str) -> None:
        path = self._path(prefix.rstrip("/"))
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)
        elif path.is_file():
            path.unlink(missing_ok=True)

    def list_children(self, prefix: str) -> list[tuple[str, float]]:
        path = self._path(prefix.rstrip("/"))
        if not path.is_dir():
            return []
        out = []
        for child in path.iterdir():
            try:
                out.append((child.name, child.stat().st_mtime))
            except FileNotFoundError:  # deleted meanwhile
                continue
        return out

    def local_file(self, key: str) -> Path | None:
        path = self._path(key)
        return path if path.is_file() else None

    def presigned_url(self, key: str) -> str | None:
        return None

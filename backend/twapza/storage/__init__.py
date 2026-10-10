from functools import lru_cache

from twapza.config import get_settings
from twapza.storage.base import Storage, StorageError
from twapza.storage.local import LocalStorage

__all__ = ["LocalStorage", "Storage", "StorageError", "get_storage"]


@lru_cache
def get_storage() -> Storage:
    settings = get_settings()
    if settings.storage_backend == "local":
        return LocalStorage(settings.storage_root)
    raise ValueError(f"unsupported storage backend: {settings.storage_backend!r}")

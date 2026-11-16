"""Simple fixed-window rate limits in Redis (login, sign-up and reset attempts)."""

import logging

from fastapi import HTTPException, Request, status

log = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    """The browser's IP from X-Forwarded-For, counting only entries added by our own proxies.

    Each proxy appends the address it received the request from, so with N proxies in front
    (nginx = 1; Caddy + nginx in production = 2) the browser is the N-th entry from the end.
    Entries further left come from the browser itself and can't be trusted.
    """
    from twapza.config import get_settings

    hops = max(1, get_settings().trusted_proxy_hops)
    forwarded = [part.strip() for part in request.headers.get("x-forwarded-for", "").split(",") if part.strip()]
    if forwarded:
        return forwarded[-min(hops, len(forwarded))]
    return request.client.host if request.client else "unknown"


def hit(key: str, limit: int, window_seconds: int) -> None:
    """Count an attempt; raise 429 once ``limit`` is passed within the window."""
    from twapza import queue as jobqueue

    try:
        redis = jobqueue.get_redis()
        name = f"twapza:rl:{key}"
        count = redis.incr(name)
        if count == 1:
            redis.expire(name, window_seconds)
    except Exception:  # Redis down: don't lock everyone out
        log.warning("rate limiting unavailable", exc_info=True)
        return
    if count > limit:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            "Too many attempts. Wait a few minutes and try again.")

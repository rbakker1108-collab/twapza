"""Error reporting with Sentry (or a Sentry-compatible service such as GlitchTip).

Switched on by ``TWAPZA_SENTRY_DSN``. Only technical details are sent: no request bodies, cookies,
IP addresses or other personal data (``send_default_pii=False``), and no performance tracing.
"""

import logging

from twapza.config import get_settings

log = logging.getLogger(__name__)


def init_sentry(component: str) -> bool:
    """Start error reporting for ``component`` (api, worker, scheduler). True if it was switched on."""
    dsn = (get_settings().sentry_dsn or "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk
    except ImportError:  # pragma: no cover - sentry-sdk is a normal dependency
        log.warning("TWAPZA_SENTRY_DSN is set but sentry-sdk isn't installed")
        return False
    sentry_sdk.init(
        dsn=dsn,
        environment=get_settings().sentry_environment,
        server_name=f"twapza-{component}",
        send_default_pii=False,
        traces_sample_rate=0.0,
        max_request_body_size="never",
    )
    sentry_sdk.set_tag("component", component)
    log.info("error reporting switched on for %s", component)
    return True

"""Subscriptions through Lemon Squeezy (merchant of record: they handle VAT and sales tax).

Flow: ``POST /api/billing/checkout`` creates a hosted checkout for a plan's variant, with our
user id as custom data -> the buyer pays on Lemon Squeezy -> Lemon Squeezy calls
``POST /api/billing/webhook`` (signed) for every subscription change -> ``apply_subscription``
copies the plan and status onto the ``User``. Managing payment details, invoices and
cancelling happens in Lemon Squeezy's customer portal.
"""

import hashlib
import hmac
import logging
from datetime import datetime

import httpx

from twapza.config import Settings
from twapza.db.models import User, utcnow

log = logging.getLogger(__name__)

API = "https://api.lemonsqueezy.com/v1"


class BillingError(Exception):
    """A readable problem talking to Lemon Squeezy."""


def verify_signature(body: bytes, signature: str | None, secret: str) -> bool:
    """Lemon Squeezy signs the raw body: X-Signature = hex HMAC-SHA256 with the webhook secret."""
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip())


def plan_for_variant(settings: Settings, variant_id: object) -> tuple[str, str] | None:
    """(plan, period) for a Lemon Squeezy variant ID, or None if it isn't one of ours."""
    wanted = str(variant_id or "")
    for key, value in settings.variants.items():
        if value == wanted:
            return key
    return None


def parse_time(value: object) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def apply_subscription(user: User, subscription_id: str, attrs: dict, settings: Settings) -> bool:
    """Copy a subscription (webhook ``data``) onto the user. False if it was stale or unknown."""
    updated = parse_time(attrs.get("updated_at")) or utcnow()
    last = user.subscription_updated_at
    if last is not None and last.tzinfo is None:
        last = last.replace(tzinfo=updated.tzinfo)
    if last is not None and updated < last and user.subscription_id == subscription_id:
        return False  # webhooks can arrive out of order
    plan = plan_for_variant(settings, attrs.get("variant_id"))
    if plan is None:
        log.warning("subscription %s has unknown variant %s", subscription_id, attrs.get("variant_id"))
        return False
    user.plan, user.period = plan
    user.subscription_id = subscription_id
    user.subscription_status = str(attrs.get("status") or "")
    user.customer_id = str(attrs.get("customer_id") or "") or None
    user.variant_id = str(attrs.get("variant_id"))
    user.renews_at = parse_time(attrs.get("renews_at"))
    user.ends_at = parse_time(attrs.get("ends_at"))
    created = parse_time(attrs.get("created_at"))
    if created is not None:
        user.period_anchor = created  # monthly minutes now reset on the subscription's day
    user.subscription_updated_at = updated
    return True


class LemonSqueezy:
    def __init__(self, api_key: str, store_id: str, transport: httpx.BaseTransport | None = None):
        self.store_id = store_id
        self.client = httpx.Client(
            base_url=API, timeout=20, transport=transport,
            headers={"Authorization": f"Bearer {api_key}", "Accept": "application/vnd.api+json",
                     "Content-Type": "application/vnd.api+json"},
        )

    def _request(self, method: str, path: str, json: dict | None = None) -> dict:
        try:
            r = self.client.request(method, path, json=json)
        except httpx.HTTPError as exc:
            raise BillingError("Couldn't reach the payment provider. Try again in a minute.") from exc
        if r.status_code >= 400:
            log.warning("Lemon Squeezy %s %s -> %s: %s", method, path, r.status_code, r.text[:500])
            raise BillingError("The payment provider refused the request. Try again later.")
        return r.json() if r.content else {}

    def create_checkout(self, *, variant_id: str, email: str, user_id: str, redirect_url: str) -> str:
        body = {"data": {
            "type": "checkouts",
            "attributes": {
                "checkout_data": {"email": email, "custom": {"user_id": user_id}},
                "product_options": {"redirect_url": redirect_url},
            },
            "relationships": {
                "store": {"data": {"type": "stores", "id": str(self.store_id)}},
                "variant": {"data": {"type": "variants", "id": str(variant_id)}},
            },
        }}
        url = self._request("POST", "/checkouts", body).get("data", {}).get("attributes", {}).get("url")
        if not url:
            raise BillingError("The payment provider didn't return a checkout page.")
        return url

    def get_subscription(self, subscription_id: str) -> dict:
        return self._request("GET", f"/subscriptions/{subscription_id}").get("data", {})

    def change_variant(self, subscription_id: str, variant_id: str) -> dict:
        body = {"data": {"type": "subscriptions", "id": str(subscription_id),
                         "attributes": {"variant_id": int(variant_id)}}}
        return self._request("PATCH", f"/subscriptions/{subscription_id}", body).get("data", {})

    def cancel(self, subscription_id: str) -> None:
        self._request("DELETE", f"/subscriptions/{subscription_id}")


def get_billing(settings: Settings) -> LemonSqueezy | None:
    """The Lemon Squeezy client, or None when payments aren't configured."""
    if not settings.billing_enabled:
        return None
    return LemonSqueezy(settings.lemonsqueezy_api_key.get_secret_value(), str(settings.lemonsqueezy_store_id))

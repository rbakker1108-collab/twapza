"""Subscriptions through Creem (merchant of record: Creem sells to the customer and handles
VAT/sales tax worldwide, so no company registration is needed to accept payments).

Flow: ``POST /api/billing/checkout`` creates a hosted Creem checkout for the plan's product, with
our user id as ``request_id`` and in ``metadata`` (Creem copies checkout metadata onto the
subscription) -> the buyer pays on Creem -> Creem calls ``POST /api/billing/webhook`` (signed) ->
we read the subscription fresh from Creem and ``apply_subscription`` copies the plan and status
onto the ``User``. Payment details, invoices and cancelling happen in Creem's customer portal;
plan changes go through ``POST /v1/subscriptions/{id}/upgrade`` (prorated, charged right away).

REST + JSON with httpx (no SDK). Docs: https://docs.creem.io (API reference, webhooks).
A ``creem_test_…`` key talks to https://test-api.creem.io, any other key to https://api.creem.io.
"""

import hashlib
import hmac
import logging
from datetime import datetime

import httpx

from twapza.config import Settings
from twapza.db.models import User, utcnow

log = logging.getLogger(__name__)

LIVE_API = "https://api.creem.io"
TEST_API = "https://test-api.creem.io"


class BillingError(Exception):
    """A readable problem talking to Creem."""


def verify_signature(body: bytes, signature: str | None, secret: str) -> bool:
    """Creem signs the raw body: ``creem-signature`` = hex HMAC-SHA256 with the webhook secret."""
    if not signature or not secret:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature.strip())


def sign(body: bytes, secret: str) -> str:
    """A valid ``creem-signature`` for ``body`` (for tests and local tools)."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def plan_for_price(settings: Settings, product_id: object) -> tuple[str, str] | None:
    """(plan, period) for a Creem product ID, or None if it isn't one of ours."""
    wanted = str(product_id or "")
    for key, value in settings.prices.items():
        if value == wanted:
            return key
    return None


def _id(value: object) -> str | None:
    """Creem sends related objects either expanded (``{"id": …}``) or as a plain ID."""
    if isinstance(value, dict):
        value = value.get("id")
    return str(value) if value else None


def _time(value: object) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def apply_subscription(user: User, subscription: dict, settings: Settings) -> bool:
    """Copy a Creem subscription object onto the user. False if its product isn't one of ours."""
    product_id = _id(subscription.get("product"))
    plan = plan_for_price(settings, product_id)
    if plan is None:
        log.warning("subscription %s has unknown product %s", subscription.get("id"), product_id)
        return False
    user.plan, user.period = plan
    user.subscription_id = str(subscription.get("id"))
    user.subscription_status = str(subscription.get("status") or "")
    user.customer_id = _id(subscription.get("customer"))
    user.price_id = product_id
    period_end = _time(subscription.get("current_period_end_date"))
    ending = user.subscription_status == "scheduled_cancel"
    user.ends_at = period_end if ending else None
    user.renews_at = None if ending else period_end
    anchor = _time(subscription.get("current_period_start_date")) or _time(subscription.get("created_at"))
    if anchor is not None:
        user.period_anchor = anchor  # monthly minutes now reset on the subscription's day
    user.subscription_updated_at = utcnow()
    return True


class Creem:
    def __init__(self, api_key: str, *, test_mode: bool | None = None, transport: httpx.BaseTransport | None = None):
        if test_mode is None:
            test_mode = api_key.startswith("creem_test_")
        self.client = httpx.Client(
            base_url=TEST_API if test_mode else LIVE_API, timeout=20, transport=transport,
            headers={"x-api-key": api_key, "Accept": "application/json"},
        )

    def _request(self, method: str, path: str, *, json: dict | None = None, params: dict | None = None) -> dict:
        try:
            r = self.client.request(method, path, json=json, params=params)
        except httpx.HTTPError as exc:
            raise BillingError("Couldn't reach the payment provider. Try again in a minute.") from exc
        if r.status_code >= 400:
            try:
                body = r.json()
            except ValueError:
                body = {}
            log.warning("Creem %s %s -> %s: %s", method, path, r.status_code, body or r.text[:500])
            message = body.get("message") if isinstance(body, dict) else None
            if isinstance(message, list):
                message = "; ".join(str(m) for m in message)
            raise BillingError(f"The payment provider refused the request: {message}" if message and r.status_code < 500
                               else "The payment provider refused the request. Try again later.")
        return r.json() if r.content else {}

    def create_checkout(self, *, product_id: str, user: User, success_url: str) -> str:
        body: dict = {
            "product_id": product_id,
            "request_id": user.id,
            "customer": {"id": user.customer_id} if user.customer_id else {"email": user.email},
            "success_url": success_url,
            "metadata": {"user_id": user.id},
        }
        url = self._request("POST", "/v1/checkouts", json=body).get("checkout_url")
        if not url:
            raise BillingError("The payment provider didn't return a checkout page.")
        return url

    def get_subscription(self, subscription_id: str) -> dict:
        return self._request("GET", "/v1/subscriptions", params={"subscription_id": subscription_id})

    def find_subscriptions(self, email: str) -> list[dict]:
        """The subscriptions Creem has for this email address (newest first)."""
        try:
            customer = self._request("GET", "/v1/customers", params={"email": email})
        except BillingError:
            return []  # no such customer yet
        customer_id = _id(customer)
        if not customer_id:
            return []
        data = self._request("GET", f"/v1/customers/{customer_id}/subscriptions", params={"page_size": 50})
        items = data.get("items") or []
        return sorted(items, key=lambda s: str(s.get("created_at") or ""), reverse=True)

    def change_product(self, subscription_id: str, product_id: str) -> dict:
        """Switch the subscription to another product; the difference is prorated and charged now."""
        return self._request("POST", f"/v1/subscriptions/{subscription_id}/upgrade",
                             json={"product_id": product_id, "update_behavior": "proration-charge-immediately"})

    def portal(self, *, customer_id: str) -> str:
        url = self._request("POST", "/v1/customers/billing", json={"customer_id": customer_id}).get("customer_portal_link")
        if not url:
            raise BillingError("The payment provider didn't return a portal link.")
        return url

    def cancel(self, subscription_id: str) -> None:
        """Cancel right away (used when an account is deleted)."""
        self._request("POST", f"/v1/subscriptions/{subscription_id}/cancel", json={"mode": "immediate"})

    def find_product(self, external_id: str) -> dict | None:
        """The product created earlier with this ``external_id`` (our own key), if any."""
        items = self._request("GET", "/v1/products/search", params={"external_id": external_id}).get("items") or []
        return items[0] if items else None

    def create_product(self, body: dict, idempotency_key: str) -> dict:
        """Create a product, or return the existing one when ``external_id`` is already taken
        (e.g. the setup ran before with this key). The result has ``existing: True`` then."""
        try:
            r = self.client.post("/v1/products", json=body, headers={"Idempotency-Key": idempotency_key})
        except httpx.HTTPError as exc:
            raise BillingError("Couldn't reach the payment provider. Try again in a minute.") from exc
        if r.status_code == 409 and body.get("external_id"):
            existing = self.find_product(body["external_id"])
            if existing:
                return existing | {"existing": True}
        if r.status_code >= 400:
            log.warning("Creem POST /v1/products -> %s: %s", r.status_code, r.text[:500])
            raise BillingError(f"Creem refused to create the product ({r.status_code}): {r.text[:300]}")
        return r.json()


def get_billing(settings: Settings) -> Creem | None:
    """The Creem client, or None when payments aren't configured."""
    if not settings.billing_enabled:
        return None
    return Creem(settings.creem_api_key.get_secret_value(), test_mode=settings.creem_test_mode)

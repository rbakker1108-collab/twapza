"""Subscriptions through Stripe Billing, with Stripe Managed Payments (merchant of record).

Flow: ``POST /api/billing/checkout`` creates a hosted Stripe Checkout Session (mode
``subscription``) for a plan's price, with our user id as ``client_reference_id`` and in the
subscription's metadata -> the buyer pays on Stripe -> Stripe calls ``POST /api/billing/webhook``
(signed) -> we fetch the subscription fresh from Stripe and ``apply_subscription`` copies the
plan and status onto the ``User``. Payment details, invoices, plan changes and cancelling happen
in Stripe's customer portal.

With Managed Payments (``TWAPZA_STRIPE_MANAGED_PAYMENTS``, default on) Stripe sells as merchant
of record and handles VAT/sales tax, fraud and disputes; without it you sell as yourself.
Talks to the REST API with httpx (no SDK), pinned to ``TWAPZA_STRIPE_API_VERSION``.
"""

import hashlib
import hmac
import logging
import time
from datetime import UTC, datetime
from urllib.parse import urlencode

import httpx

from twapza.config import Settings
from twapza.db.models import User, utcnow

log = logging.getLogger(__name__)

API = "https://api.stripe.com/v1"
SIGNATURE_TOLERANCE = 300  # seconds; Stripe's own default


class BillingError(Exception):
    """A readable problem talking to Stripe."""


def verify_signature(body: bytes, header: str | None, secret: str, *, now: float | None = None,
                     tolerance: int = SIGNATURE_TOLERANCE) -> bool:
    """Check a ``Stripe-Signature`` header: ``t=<unix time>,v1=<hex HMAC-SHA256 of "t.body">``."""
    if not header or not secret:
        return False
    parts = [p.split("=", 1) for p in header.split(",") if "=" in p]
    timestamps = [v for k, v in parts if k.strip() == "t"]
    signatures = [v.strip() for k, v in parts if k.strip() == "v1"]
    if not timestamps or not signatures:
        return False
    try:
        timestamp = int(timestamps[0])
    except ValueError:
        return False
    if abs((now if now is not None else time.time()) - timestamp) > tolerance:
        return False  # replayed or very late
    expected = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return any(hmac.compare_digest(expected, sig) for sig in signatures)


def sign(body: bytes, secret: str, timestamp: int | None = None) -> str:
    """A valid ``Stripe-Signature`` header for ``body`` (for tests and local tools)."""
    timestamp = int(time.time()) if timestamp is None else timestamp
    digest = hmac.new(secret.encode(), f"{timestamp}.".encode() + body, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def encode(params: dict, prefix: str = "") -> list[tuple[str, str]]:
    """Stripe's form encoding: nested dicts/lists become ``a[b][0][c]=…``."""
    out: list[tuple[str, str]] = []
    for key, value in params.items():
        name = f"{prefix}[{key}]" if prefix else str(key)
        if value is None:
            continue
        if isinstance(value, dict):
            out += encode(value, name)
        elif isinstance(value, list):
            for i, item in enumerate(value):
                if isinstance(item, dict):
                    out += encode(item, f"{name}[{i}]")
                else:
                    out.append((f"{name}[{i}]", _scalar(item)))
        else:
            out.append((name, _scalar(value)))
    return out


def _scalar(value: object) -> str:
    return ("true" if value else "false") if isinstance(value, bool) else str(value)


def plan_for_price(settings: Settings, price_id: object) -> tuple[str, str] | None:
    """(plan, period) for a Stripe price ID, or None if it isn't one of ours."""
    wanted = str(price_id or "")
    for key, value in settings.prices.items():
        if value == wanted:
            return key
    return None


def _time(value: object) -> datetime | None:
    return datetime.fromtimestamp(int(value), UTC) if isinstance(value, (int, float)) and value else None


def first_item(subscription: dict) -> dict:
    items = ((subscription.get("items") or {}).get("data")) or []
    return items[0] if items else {}


def apply_subscription(user: User, subscription: dict, settings: Settings) -> bool:
    """Copy a Stripe subscription object onto the user. False if its price isn't one of ours."""
    item = first_item(subscription)
    price_id = (item.get("price") or {}).get("id")
    plan = plan_for_price(settings, price_id)
    if plan is None:
        log.warning("subscription %s has unknown price %s", subscription.get("id"), price_id)
        return False
    user.plan, user.period = plan
    user.subscription_id = str(subscription.get("id"))
    user.subscription_status = str(subscription.get("status") or "")
    customer = subscription.get("customer")
    user.customer_id = str(customer.get("id") if isinstance(customer, dict) else customer or "") or None
    user.price_id = str(price_id)
    # Since API 2025-03-31 the billing period lives on the subscription item.
    period_end = _time(item.get("current_period_end") or subscription.get("current_period_end"))
    ending = subscription.get("cancel_at_period_end") or subscription.get("cancel_at")
    user.ends_at = (_time(subscription.get("cancel_at")) or period_end) if ending else None
    user.renews_at = None if ending else period_end
    anchor = _time(subscription.get("billing_cycle_anchor") or subscription.get("start_date"))
    if anchor is not None:
        user.period_anchor = anchor  # monthly minutes now reset on the subscription's day
    user.subscription_updated_at = utcnow()
    return True


class Stripe:
    def __init__(self, secret_key: str, *, api_version: str, managed_payments: bool = True,
                 portal_configuration: str | None = None, transport: httpx.BaseTransport | None = None):
        self.managed_payments = managed_payments
        self.portal_configuration = portal_configuration
        self.client = httpx.Client(
            base_url=API, timeout=20, transport=transport,
            headers={"Authorization": f"Bearer {secret_key}", "Stripe-Version": api_version},
        )

    def _request(self, method: str, path: str, params: dict | None = None,
                 idempotency_key: str | None = None) -> dict:
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else {}
        body, query = None, None
        if params and method == "GET":
            query = encode(params)
        elif params:
            body = urlencode(encode(params))
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        try:
            r = self.client.request(method, path, content=body, params=query, headers=headers)
        except httpx.HTTPError as exc:
            raise BillingError("Couldn't reach the payment provider. Try again in a minute.") from exc
        if r.status_code >= 400:
            try:
                error = r.json().get("error", {})
            except ValueError:
                error = {}
            log.warning("Stripe %s %s -> %s: %s", method, path, r.status_code, error or r.text[:500])
            reason = error.get("message") if error.get("type") == "invalid_request_error" else None
            raise BillingError(f"The payment provider refused the request: {reason}" if reason
                               else "The payment provider refused the request. Try again later.")
        return r.json() if r.content else {}

    def create_checkout(self, *, price_id: str, user: User, success_url: str, cancel_url: str) -> str:
        params: dict = {
            "mode": "subscription",
            "line_items": [{"price": price_id, "quantity": 1}],
            "client_reference_id": user.id,
            "metadata": {"user_id": user.id},
            "subscription_data": {"metadata": {"user_id": user.id}},
            "success_url": success_url,
            "cancel_url": cancel_url,
        }
        if user.customer_id:
            params["customer"] = user.customer_id  # returning customer: same Stripe customer
        else:
            params["customer_email"] = user.email
        if self.managed_payments:
            params["managed_payments"] = {"enabled": True}
        url = self._request("POST", "/checkout/sessions", params).get("url")
        if not url:
            raise BillingError("The payment provider didn't return a checkout page.")
        return url

    def get_subscription(self, subscription_id: str) -> dict:
        return self._request("GET", f"/subscriptions/{subscription_id}")

    def portal(self, *, customer_id: str, return_url: str, flow: dict | None = None) -> str:
        params: dict = {"customer": customer_id, "return_url": return_url, "flow_data": flow,
                        "configuration": self.portal_configuration}
        url = self._request("POST", "/billing_portal/sessions", params).get("url")
        if not url:
            raise BillingError("The payment provider didn't return a portal link.")
        return url

    def change_plan_url(self, *, subscription_id: str, customer_id: str, price_id: str, return_url: str) -> str:
        """A portal page where the customer confirms switching to ``price_id`` (Stripe prorates)."""
        item = first_item(self.get_subscription(subscription_id))
        if not item.get("id"):
            raise BillingError("Couldn't find your current subscription.")
        if (item.get("price") or {}).get("id") == price_id:
            raise BillingError("That's already your plan.")
        flow = {
            "type": "subscription_update_confirm",
            "subscription_update_confirm": {
                "subscription": subscription_id,
                "items": [{"id": item["id"], "price": price_id, "quantity": 1}],
            },
            "after_completion": {"type": "redirect", "redirect": {"return_url": return_url}},
        }
        return self.portal(customer_id=customer_id, return_url=return_url, flow=flow)

    def cancel(self, subscription_id: str) -> None:
        """Cancel right away (used when an account is deleted)."""
        self._request("DELETE", f"/subscriptions/{subscription_id}")


def get_billing(settings: Settings) -> Stripe | None:
    """The Stripe client, or None when payments aren't configured."""
    if not settings.billing_enabled:
        return None
    return Stripe(settings.stripe_secret_key.get_secret_value(), api_version=settings.stripe_api_version,
                  managed_payments=settings.stripe_managed_payments,
                  portal_configuration=settings.stripe_portal_configuration)

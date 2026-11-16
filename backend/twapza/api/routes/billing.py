"""Paid plans through Lemon Squeezy: checkout, plan changes, customer portal, webhook."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from twapza.accounts.billing import BillingError, LemonSqueezy, apply_subscription, get_billing, verify_signature
from twapza.accounts.plans import ACTIVE_STATUSES
from twapza.accounts.users import account_read
from twapza.api.deps import current_user
from twapza.api.schemas import AccountRead, CheckoutRequest, UrlResponse
from twapza.config import Settings, get_settings
from twapza.db.models import User
from twapza.db.session import get_session

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

NOT_SET_UP = "Payments aren't set up on this Twapza server yet."


def billing_client(settings: Settings = Depends(get_settings)) -> LemonSqueezy | None:
    """FastAPI dependency (replaced by a fake in tests)."""
    return get_billing(settings)


def _require(billing: LemonSqueezy | None) -> LemonSqueezy:
    if billing is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_SET_UP)
    return billing


def _variant(settings: Settings, plan: str, period: str) -> str:
    variant = settings.variants.get((plan, period))
    if not variant:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_SET_UP)
    return variant


def _has_subscription(user: User) -> bool:
    return bool(user.subscription_id) and user.subscription_status in ACTIVE_STATUSES - {"manual"} | {"paused"}


@router.post("/checkout", response_model=UrlResponse)
def checkout(body: CheckoutRequest, user: User = Depends(current_user), settings: Settings = Depends(get_settings),
             billing: LemonSqueezy | None = Depends(billing_client)) -> UrlResponse:
    """A Lemon Squeezy checkout page for the plan (taxes are added there)."""
    billing = _require(billing)
    if _has_subscription(user):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "You already have a subscription. Change your plan on your account page.")
    variant = _variant(settings, body.plan, body.period)
    try:
        url = billing.create_checkout(variant_id=variant, email=user.email, user_id=user.id,
                                      redirect_url=f"{settings.public_url.rstrip('/')}/account?upgraded=1")
    except BillingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from None
    return UrlResponse(url=url)


@router.post("/change-plan", response_model=AccountRead)
def change_plan(body: CheckoutRequest, user: User = Depends(current_user), session: Session = Depends(get_session),
                settings: Settings = Depends(get_settings),
                billing: LemonSqueezy | None = Depends(billing_client)) -> AccountRead:
    """Switch an existing subscription to another plan/period (Lemon Squeezy prorates it)."""
    billing = _require(billing)
    if not _has_subscription(user):
        raise HTTPException(status.HTTP_409_CONFLICT, "You don't have a subscription to change.")
    variant = _variant(settings, body.plan, body.period)
    try:
        data = billing.change_variant(user.subscription_id, variant)
    except BillingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from None
    if data.get("attributes"):
        apply_subscription(user, str(data.get("id") or user.subscription_id), data["attributes"], settings)
        session.add(user)
        session.commit()
    return account_read(session, user)


@router.get("/portal", response_model=UrlResponse)
def portal(user: User = Depends(current_user),
           billing: LemonSqueezy | None = Depends(billing_client)) -> UrlResponse:
    """Lemon Squeezy's customer portal: payment method, invoices, cancel (signed link, fetched fresh)."""
    billing = _require(billing)
    if not user.subscription_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "You don't have a subscription yet.")
    try:
        data = billing.get_subscription(user.subscription_id)
    except BillingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from None
    url = (data.get("attributes", {}).get("urls") or {}).get("customer_portal")
    if not url:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "The payment provider didn't return a portal link.")
    return UrlResponse(url=url)


@router.post("/webhook")
async def webhook(request: Request, session: Session = Depends(get_session),
                  settings: Settings = Depends(get_settings)) -> dict:
    """Subscription events from Lemon Squeezy (subscription_created/updated/cancelled/…)."""
    body = await request.body()
    secret = settings.lemonsqueezy_webhook_secret.get_secret_value() if settings.lemonsqueezy_webhook_secret else ""
    if not verify_signature(body, request.headers.get("x-signature"), secret):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid signature.")
    try:
        payload = json.loads(body)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON.") from None
    meta, data = payload.get("meta") or {}, payload.get("data") or {}
    event = str(meta.get("event_name") or "")
    if not event.startswith("subscription_") or data.get("type") != "subscriptions":
        return {"ok": True, "ignored": event}  # e.g. order_created: the subscription events follow

    subscription_id = str(data.get("id") or "")
    attrs = data.get("attributes") or {}
    user_id = (meta.get("custom_data") or {}).get("user_id")
    user = session.get(User, str(user_id)) if user_id else None
    if user is None and subscription_id:
        user = session.exec(select(User).where(User.subscription_id == subscription_id)).first()
    if user is None:
        log.warning("webhook %s for subscription %s: no matching user", event, subscription_id)
        return {"ok": True, "ignored": "unknown user"}
    if user.subscription_id and user.subscription_id != subscription_id and _has_subscription(user) \
            and attrs.get("status") in ("cancelled", "expired"):
        return {"ok": True, "ignored": "old subscription"}  # an earlier subscription ending
    if apply_subscription(user, subscription_id, attrs, settings):
        session.add(user)
        session.commit()
        log.info("user %s: %s -> plan %s (%s)", user.id, event, user.plan, user.subscription_status)
    return {"ok": True}

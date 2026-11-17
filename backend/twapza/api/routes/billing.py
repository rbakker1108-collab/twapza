"""Paid plans through Creem: checkout, plan changes, customer portal, webhook."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from twapza.accounts.billing import BillingError, Creem, _id, apply_subscription, get_billing, verify_signature
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

# Subscription statuses of someone who is (still) paying through Creem
RUNNING = (ACTIVE_STATUSES - {"manual"}) | {"paused"}


def billing_client(settings: Settings = Depends(get_settings)) -> Creem | None:
    """FastAPI dependency (replaced by a fake in tests)."""
    return get_billing(settings)


def _require(billing: Creem | None) -> Creem:
    if billing is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_SET_UP)
    return billing


def _product(settings: Settings, plan: str, period: str) -> str:
    product = settings.prices.get((plan, period))
    if not product:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_SET_UP)
    return product


def _has_subscription(user: User) -> bool:
    return bool(user.subscription_id) and user.subscription_status in RUNNING


def _account_url(settings: Settings, query: str = "") -> str:
    return f"{settings.public_url.rstrip('/')}/account{query}"


def _found_running_subscription(session: Session, user: User, billing: Creem, settings: Settings) -> bool:
    """Ask Creem whether this account already pays (e.g. a webhook was lost or is still on its way),
    so nobody pays twice. If so, the account is updated from it."""
    try:
        found = billing.find_subscriptions(user.email)
    except BillingError:
        return False  # lookup unavailable: don't block buying
    for subscription in found:
        owner = (subscription.get("metadata") or {}).get("user_id")
        if owner not in (None, user.id):
            continue  # same email, but bought for another Twapza account
        if subscription.get("status") in RUNNING and apply_subscription(user, subscription, settings):
            session.add(user)
            session.commit()
            return True
    return False


@router.post("/checkout", response_model=UrlResponse)
def checkout(body: CheckoutRequest, user: User = Depends(current_user), session: Session = Depends(get_session),
             settings: Settings = Depends(get_settings),
             billing: Creem | None = Depends(billing_client)) -> UrlResponse:
    """A Creem checkout page for the plan (taxes are added there)."""
    billing = _require(billing)
    if _has_subscription(user) or _found_running_subscription(session, user, billing, settings):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "You already have a subscription. Change your plan on your account page.")
    product = _product(settings, body.plan, body.period)
    try:
        url = billing.create_checkout(product_id=product, user=user,
                                      success_url=_account_url(settings, "?upgraded=1"))
    except BillingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from None
    return UrlResponse(url=url)


@router.post("/change-plan", response_model=AccountRead)
def change_plan(body: CheckoutRequest, user: User = Depends(current_user), session: Session = Depends(get_session),
                settings: Settings = Depends(get_settings),
                billing: Creem | None = Depends(billing_client)) -> AccountRead:
    """Switch the subscription to another plan/period. Creem prorates and charges the difference now."""
    billing = _require(billing)
    if not _has_subscription(user):
        raise HTTPException(status.HTTP_409_CONFLICT, "You don't have a subscription to change.")
    product = _product(settings, body.plan, body.period)
    if product == user.price_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "That's already your plan.")
    try:
        subscription = billing.change_product(user.subscription_id, product)
    except BillingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from None
    if subscription.get("id") and apply_subscription(user, subscription, settings):
        session.add(user)
        session.commit()
    return account_read(session, user)


@router.get("/portal", response_model=UrlResponse)
def portal(user: User = Depends(current_user), billing: Creem | None = Depends(billing_client)) -> UrlResponse:
    """Creem's customer portal: payment method, invoices, cancel."""
    billing = _require(billing)
    if not user.customer_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "You don't have a subscription yet.")
    try:
        return UrlResponse(url=billing.portal(customer_id=user.customer_id))
    except BillingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from None


def _find_user(session: Session, metadata: dict, subscription_id: str | None, customer_id: str | None) -> User | None:
    user_id = metadata.get("user_id")
    if user_id and (user := session.get(User, str(user_id))):
        return user
    if subscription_id and (user := session.exec(select(User).where(User.subscription_id == subscription_id)).first()):
        return user
    if customer_id:
        return session.exec(select(User).where(User.customer_id == customer_id)).first()
    return None


@router.post("/webhook")
async def webhook(request: Request, session: Session = Depends(get_session),
                  settings: Settings = Depends(get_settings),
                  billing: Creem | None = Depends(billing_client)) -> dict:
    """Events from Creem. Every subscription event is answered by reading the subscription fresh
    from Creem, so events arriving twice or out of order do no harm."""
    body = await request.body()
    secret = settings.creem_webhook_secret.get_secret_value() if settings.creem_webhook_secret else ""
    if not verify_signature(body, request.headers.get("creem-signature"), secret):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid signature.")
    try:
        event = json.loads(body)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON.") from None
    kind = str(event.get("eventType") or "")
    obj = event.get("object") or {}
    if kind == "checkout.completed":
        subscription_id = _id(obj.get("subscription"))
        if not subscription_id:
            return {"ok": True, "ignored": "not a subscription checkout"}
        sub = obj.get("subscription")
        metadata = obj.get("metadata") or (sub.get("metadata") if isinstance(sub, dict) else None) or {}
    elif kind.startswith("subscription.") and obj.get("id"):
        subscription_id = str(obj["id"])
        metadata = obj.get("metadata") or {}
    else:
        return {"ok": True, "ignored": kind}

    user = _find_user(session, metadata, subscription_id, _id(obj.get("customer")))
    if user is None:
        log.warning("webhook %s for subscription %s: no matching user", kind, subscription_id)
        return {"ok": True, "ignored": "unknown user"}
    if billing is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_SET_UP)  # Creem retries later
    try:
        subscription = billing.get_subscription(subscription_id)
    except BillingError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn't read the subscription.") from None
    if user.subscription_id and user.subscription_id != subscription_id and _has_subscription(user) \
            and subscription.get("status") not in RUNNING:
        return {"ok": True, "ignored": "old subscription"}  # an earlier subscription ending
    if apply_subscription(user, subscription, settings):
        session.add(user)
        session.commit()
        log.info("user %s: %s -> plan %s (%s)", user.id, kind, user.plan, user.subscription_status)
    return {"ok": True}

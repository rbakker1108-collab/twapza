"""Paid plans through Stripe: checkout, plan changes, customer portal, webhook."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session, select

from twapza.accounts.billing import BillingError, Stripe, apply_subscription, get_billing, verify_signature
from twapza.accounts.plans import ACTIVE_STATUSES
from twapza.api.deps import current_user
from twapza.api.schemas import CheckoutRequest, UrlResponse
from twapza.config import Settings, get_settings
from twapza.db.models import User
from twapza.db.session import get_session

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])

NOT_SET_UP = "Payments aren't set up on this Twapza server yet."

# Events that can change a subscription; for all of them we read the subscription from Stripe.
SUBSCRIPTION_EVENTS = {
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.paused",
    "customer.subscription.resumed",
}


def billing_client(settings: Settings = Depends(get_settings)) -> Stripe | None:
    """FastAPI dependency (replaced by a fake in tests)."""
    return get_billing(settings)


def _require(billing: Stripe | None) -> Stripe:
    if billing is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_SET_UP)
    return billing


def _price(settings: Settings, plan: str, period: str) -> str:
    price = settings.prices.get((plan, period))
    if not price:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_SET_UP)
    return price


def _has_subscription(user: User) -> bool:
    return bool(user.subscription_id) and user.subscription_status in (ACTIVE_STATUSES - {"manual"}) | {"paused"}


def _account_url(settings: Settings, query: str = "") -> str:
    return f"{settings.public_url.rstrip('/')}/account{query}"


@router.post("/checkout", response_model=UrlResponse)
def checkout(body: CheckoutRequest, user: User = Depends(current_user), settings: Settings = Depends(get_settings),
             billing: Stripe | None = Depends(billing_client)) -> UrlResponse:
    """A Stripe Checkout page for the plan (taxes are added there)."""
    billing = _require(billing)
    if _has_subscription(user):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "You already have a subscription. Change your plan on your account page.")
    price = _price(settings, body.plan, body.period)
    try:
        url = billing.create_checkout(price_id=price, user=user,
                                      success_url=_account_url(settings, "?upgraded=1"),
                                      cancel_url=_account_url(settings, "#plans"))
    except BillingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from None
    return UrlResponse(url=url)


@router.post("/change-plan", response_model=UrlResponse)
def change_plan(body: CheckoutRequest, user: User = Depends(current_user), settings: Settings = Depends(get_settings),
                billing: Stripe | None = Depends(billing_client)) -> UrlResponse:
    """A Stripe page where the customer confirms switching their subscription to another plan/period."""
    billing = _require(billing)
    if not _has_subscription(user) or not user.customer_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You don't have a subscription to change.")
    price = _price(settings, body.plan, body.period)
    if price == user.price_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "That's already your plan.")
    try:
        url = billing.change_plan_url(subscription_id=user.subscription_id, customer_id=user.customer_id,
                                      price_id=price, return_url=_account_url(settings, "?upgraded=1"))
    except BillingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from None
    return UrlResponse(url=url)


@router.get("/portal", response_model=UrlResponse)
def portal(user: User = Depends(current_user), settings: Settings = Depends(get_settings),
           billing: Stripe | None = Depends(billing_client)) -> UrlResponse:
    """Stripe's customer portal: payment method, invoices, plan changes, cancel."""
    billing = _require(billing)
    if not user.customer_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "You don't have a subscription yet.")
    try:
        return UrlResponse(url=billing.portal(customer_id=user.customer_id, return_url=_account_url(settings)))
    except BillingError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from None


def _find_user(session: Session, obj: dict, subscription_id: str | None, customer_id: str | None) -> User | None:
    metadata = obj.get("metadata") or {}
    user_id = obj.get("client_reference_id") or metadata.get("user_id")
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
                  billing: Stripe | None = Depends(billing_client)) -> dict:
    """Events from Stripe. Every subscription event is answered by reading the subscription
    fresh from Stripe, so events arriving twice or out of order do no harm."""
    body = await request.body()
    secret = settings.stripe_webhook_secret.get_secret_value() if settings.stripe_webhook_secret else ""
    if not verify_signature(body, request.headers.get("stripe-signature"), secret):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid signature.")
    try:
        event = json.loads(body)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid JSON.") from None
    kind = str(event.get("type") or "")
    obj = (event.get("data") or {}).get("object") or {}
    if kind not in SUBSCRIPTION_EVENTS:
        return {"ok": True, "ignored": kind}
    if kind == "checkout.session.completed":
        if obj.get("mode") != "subscription" or not obj.get("subscription"):
            return {"ok": True, "ignored": "not a subscription checkout"}
        subscription_id = str(obj["subscription"])
    else:
        subscription_id = str(obj.get("id") or "")
    customer = obj.get("customer")
    customer_id = str(customer.get("id") if isinstance(customer, dict) else customer or "") or None

    user = _find_user(session, obj, subscription_id, customer_id)
    if user is None:
        log.warning("webhook %s for subscription %s: no matching user", kind, subscription_id)
        return {"ok": True, "ignored": "unknown user"}
    if billing is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, NOT_SET_UP)  # Stripe retries later
    try:
        subscription = billing.get_subscription(subscription_id)
    except BillingError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn't read the subscription.") from None
    if user.subscription_id and user.subscription_id != subscription_id and _has_subscription(user) \
            and subscription.get("status") not in ACTIVE_STATUSES:
        return {"ok": True, "ignored": "old subscription"}  # an earlier subscription ending
    if apply_subscription(user, subscription, settings):
        session.add(user)
        session.commit()
        log.info("user %s: %s -> plan %s (%s)", user.id, kind, user.plan, user.subscription_status)
    return {"ok": True}

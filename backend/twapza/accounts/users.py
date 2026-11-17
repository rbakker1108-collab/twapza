"""Creating, reading and deleting accounts (used by the API and the `twapza.users` CLI)."""

import logging
import re

from sqlmodel import Session, delete, select

from twapza.accounts.billing import BillingError, get_billing
from twapza.accounts.passwords import hash_password
from twapza.accounts.usage import plan_of, usage_of
from twapza.api.schemas import AccountRead, PlanLimits, SubscriptionRead, UsageRead
from twapza.config import get_settings
from twapza.db.models import AuthSession, Job, JobStatus, PasswordReset, Project, UsageEvent, User
from twapza.storage import get_storage

log = logging.getLogger(__name__)

EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


def normalize_email(email: str) -> str | None:
    email = email.strip().lower()
    return email if EMAIL.match(email) else None


def find_user(session: Session, email: str) -> User | None:
    return session.exec(select(User).where(User.email == email.strip().lower())).first()


def create_user(session: Session, email: str, password: str, lang: str = "en") -> User:
    user = User(email=email, password_hash=hash_password(password), lang=lang)
    user.period_anchor = user.created_at
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def account_read(session: Session, user: User) -> AccountRead:
    plan = plan_of(user)
    usage = usage_of(session, user)
    subscription = None
    if user.subscription_status:
        subscription = SubscriptionRead(plan=user.plan, period=user.period, status=user.subscription_status,
                                        renews_at=user.renews_at, ends_at=user.ends_at)
    return AccountRead(
        id=user.id, email=user.email, lang=user.lang, created_at=user.created_at,
        plan=PlanLimits(**plan.as_dict()),
        usage=UsageRead(used_minutes=round(usage.used_seconds / 60, 1),
                        limit_minutes=usage.limit_seconds / 60, resets_at=usage.period_end),
        subscription=subscription, billing_enabled=get_settings().billing_enabled,
    )


def delete_user(session: Session, user: User) -> None:
    """Delete the account, its projects and files, and cancel its subscription."""
    from twapza.cleanup import delete_project

    if user.subscription_id and user.subscription_status not in (None, "canceled", "unpaid", "manual"):
        billing = get_billing(get_settings())
        if billing is not None:
            try:
                billing.cancel(user.subscription_id)
            except BillingError:
                log.warning("couldn't cancel subscription %s of deleted user %s", user.subscription_id, user.id)
                raise
    storage = get_storage()
    for project in session.exec(select(Project).where(Project.user_id == user.id)).all():
        for job in session.exec(select(Job).where(Job.project_id == project.id)).all():
            if not job.status.is_terminal:
                job.status = JobStatus.CANCELED
                session.add(job)
        session.commit()
        delete_project(session, storage, project)
        session.commit()
    for table in (AuthSession, PasswordReset, UsageEvent):
        session.exec(delete(table).where(table.user_id == user.id))
    session.delete(user)
    session.commit()

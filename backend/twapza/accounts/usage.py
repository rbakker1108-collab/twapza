"""A user's current plan and monthly video minutes."""

import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func
from sqlmodel import Session, select

from twapza.accounts.plans import PLANS, Plan, effective_plan_id, period_bounds
from twapza.db.models import Project, UsageEvent, User, utcnow

log = logging.getLogger(__name__)


def _aware(dt: datetime | None) -> datetime | None:
    """SQLite hands datetimes back without a timezone; they are all UTC."""
    if dt is not None and dt.tzinfo is None:
        from datetime import UTC
        return dt.replace(tzinfo=UTC)
    return dt


def plan_of(user: User | None, now: datetime | None = None) -> Plan:
    if user is None:
        return PLANS["free"]
    now = now or utcnow()
    return PLANS[effective_plan_id(user.plan, user.subscription_status, _aware(user.ends_at), now)]


@dataclass
class Usage:
    used_seconds: float
    limit_seconds: float
    period_start: datetime
    period_end: datetime

    @property
    def remaining_seconds(self) -> float:
        return max(0.0, self.limit_seconds - self.used_seconds)


def usage_of(session: Session, user: User, now: datetime | None = None) -> Usage:
    now = now or utcnow()
    anchor = _aware(user.period_anchor) or _aware(user.created_at) or now
    start, end = period_bounds(anchor, now)
    used = session.exec(
        select(func.coalesce(func.sum(UsageEvent.seconds), 0.0))
        .where(UsageEvent.user_id == user.id, UsageEvent.created_at >= start)
    ).one()
    return Usage(used_seconds=float(used or 0.0), limit_seconds=plan_of(user, now).minutes * 60.0,
                 period_start=start, period_end=end)


def _minutes(seconds: float) -> str:
    return f"{max(seconds, 0) / 60:.0f}"


def video_problem(session: Session, user: User, duration: float) -> str | None:
    """Why a video of ``duration`` seconds can't be added on the user's plan, or None."""
    plan = plan_of(user)
    if duration > plan.max_video_minutes * 60:
        return (f"Video is {_minutes(duration)} min long; your plan allows videos up to "
                f"{plan.max_video_minutes} min. Upgrade on your account page for longer videos.")
    usage = usage_of(session, user)
    if duration > usage.remaining_seconds:
        return (f"Video is {_minutes(duration)} min long, but you have {_minutes(usage.remaining_seconds)} "
                f"of your {plan.minutes} minutes left this month. Upgrade on your account page, or "
                f"wait until {usage.period_end:%Y-%m-%d}.")
    return None


def owner(session: Session, project: Project) -> User | None:
    return session.get(User, project.user_id) if project.user_id else None


def record_usage(session: Session, project: Project, seconds: float) -> None:
    """Charge a processed video to its owner (once per project)."""
    if not project.user_id:
        return
    already = session.exec(select(UsageEvent).where(UsageEvent.project_id == project.id)).first()
    if already is None:
        session.add(UsageEvent(user_id=project.user_id, project_id=project.id, seconds=seconds))
        session.commit()

"""Plans and their limits (pure). The website shows the same numbers: frontend/src/marketing/plans.ts."""

import calendar
from dataclasses import asdict, dataclass
from datetime import datetime

# Creem subscription statuses during which the paid plan applies ("past_due": while Creem retries
# a failed payment; "scheduled_cancel": cancelled, but paid until the period ends).
# "manual" is a plan set by hand (`python -m twapza.users`).
ACTIVE_STATUSES = {"active", "trialing", "past_due", "scheduled_cancel", "manual"}


@dataclass(frozen=True)
class Plan:
    id: str
    minutes: int  # video minutes per month
    max_video_minutes: int  # longest video that can be added
    watermark: bool  # small "Twapza" mark on downloads
    editing: bool  # clip editor extras: hook text, own texts, caption fixes, cut pauses/fillers,
    #                cold open, AI descriptions and titles
    zip: bool  # download all clips at once
    priority: bool  # jobs go to the priority queue
    ai_per_day: int  # Claude calls (finding highlights, writing descriptions/titles) per day

    def as_dict(self) -> dict:
        return asdict(self)


PLANS: dict[str, Plan] = {
    "free": Plan("free", minutes=60, max_video_minutes=60, watermark=True, editing=False,
                 zip=False, priority=False, ai_per_day=10),
    "creator": Plan("creator", minutes=300, max_video_minutes=120, watermark=False, editing=True,
                    zip=False, priority=False, ai_per_day=60),
    "pro": Plan("pro", minutes=1200, max_video_minutes=180, watermark=False, editing=True,
                zip=True, priority=True, ai_per_day=200),
}

NEEDS_CREATOR = "This needs the Creator plan. Upgrade on your account page."
NEEDS_PRO = "This needs the Pro plan. Upgrade on your account page."


def effective_plan_id(plan: str, status: str | None, ends_at: datetime | None, now: datetime) -> str:
    """Which plan's limits apply right now."""
    if plan not in PLANS or plan == "free":
        return "free"
    if status in ACTIVE_STATUSES:
        # Cancelled at period end and that moment has passed (in case the final webhook is late)
        if ends_at is not None and ends_at <= now and status != "manual":
            return "free"
        return plan
    return "free"


def _add_months(anchor: datetime, year: int, month: int) -> datetime:
    """``anchor``'s day and time in the given month (the 31st becomes the month's last day)."""
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return anchor.replace(year=year, month=month, day=day)


def period_bounds(anchor: datetime, now: datetime) -> tuple[datetime, datetime]:
    """The monthly usage period containing ``now``: starts on ``anchor``'s day of the month."""
    year, month = now.year, now.month
    start = _add_months(anchor, year, month)
    if start > now:
        year, month = (year - 1, 12) if month == 1 else (year, month - 1)
        start = _add_months(anchor, year, month)
    ny, nm = (year + 1, 1) if month == 12 else (year, month + 1)
    return start, _add_months(anchor, ny, nm)

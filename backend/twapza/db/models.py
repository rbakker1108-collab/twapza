"""Database models. All datetimes are timezone-aware UTC."""

import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return uuid.uuid4().hex


class ProjectStatus(StrEnum):
    UPLOADING = "uploading"
    QUEUED = "queued"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class JobType(StrEnum):
    INGEST = "ingest"
    TRANSCRIBE = "transcribe"
    SIMPLE_CLIPS = "simple_clips"
    EXPORT = "export"
    EXPORT_ZIP = "export_zip"
    AI_CLIPS = "ai_clips"
    IMPORT = "import"


class ClipSource(StrEnum):
    SIMPLE = "simple"
    AI = "ai"


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"

    @property
    def is_terminal(self) -> bool:
        return self in (JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELED)


class Project(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    # The account that owns the project (only they can see it). None for projects made before
    # accounts existed; nobody can open those and they expire as usual.
    user_id: str | None = Field(default=None, index=True)
    filename: str
    ext: str
    size_bytes: int
    chunk_size: int
    total_chunks: int
    status: ProjectStatus = ProjectStatus.UPLOADING
    rights_confirmed_at: datetime
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime = Field(index=True)
    error: str | None = None
    # Where the video comes from, for crediting the original creator in clip descriptions.
    # Filled in by a YouTube import; editable for any project.
    source_url: str | None = None
    source_title: str | None = None
    source_channel: str | None = None
    source_channel_url: str | None = None

    # Filled in by the ingest job
    duration: float | None = None
    width: int | None = None
    height: int | None = None
    fps: float | None = None
    video_codec: str | None = None
    audio_codec: str | None = None
    has_audio: bool | None = None

    @property
    def prefix(self) -> str:
        return f"projects/{self.id}/"

    @property
    def original_key(self) -> str:
        return f"{self.prefix}original.{self.ext}"

    @property
    def proxy_key(self) -> str:
        return f"{self.prefix}proxy.mp4"

    @property
    def audio_key(self) -> str:
        return f"{self.prefix}audio.wav"

    @property
    def transcript_key(self) -> str:
        return f"{self.prefix}transcript.json"

    @property
    def corrections_key(self) -> str:
        """Caption fixes made in the clip editor: {"<word start, 3 decimals>": "new text"}."""
        return f"{self.prefix}corrections.json"

    @property
    def scenes_key(self) -> str:
        return f"{self.prefix}scenes.json"

    @property
    def stem(self) -> str:
        """Filename without extension, for naming downloads."""
        return self.filename.rsplit(".", 1)[0] or "video"


class UploadPart(SQLModel, table=True):
    project_id: str = Field(foreign_key="project.id", primary_key=True)
    index: int = Field(primary_key=True)
    size: int


class Job(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    type: JobType
    status: JobStatus = JobStatus.QUEUED
    progress: float = 0.0
    message: str | None = None
    error: str | None = None
    created_at: datetime = Field(default_factory=utcnow)
    started_at: datetime | None = None
    finished_at: datetime | None = None
    # Jobs that produce a downloadable file (exports, ZIPs)
    result_key: str | None = None
    result_name: str | None = None


class Clip(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    project_id: str = Field(foreign_key="project.id", index=True)
    source: ClipSource
    index: int
    start: float
    end: float
    text: str = ""
    # AI highlight fields (Stage 3)
    title: str | None = None
    hook: str | None = None
    score: float | None = None
    reason: str | None = None
    # Where the clip was originally suggested, so a trim can be undone
    suggested_start: float | None = None
    suggested_end: float | None = None
    # Generated YouTube Shorts description (credit is added when it is shown)
    description: str | None = None
    hashtags: str | None = None  # space-separated, e.g. "#shorts #amazon"
    title_options: str | None = None  # JSON list of suggested Shorts titles
    # The clip's most gripping line, quoted by Claude, for the optional cold open
    teaser: str | None = None
    # Texts placed in the clip editor (JSON list of api.schemas.TextOverlay)
    overlays: str | None = None
    created_at: datetime = Field(default_factory=utcnow)

    @property
    def duration(self) -> float:
        return self.end - self.start

    @property
    def thumbs_prefix(self) -> str:
        return f"projects/{self.project_id}/thumbs/{self.id}/"

    @property
    def thumbnail_key(self) -> str:
        # Named by start time so a trimmed clip gets a fresh thumbnail (and URL).
        return f"{self.thumbs_prefix}{int(self.start * 1000)}.jpg"

    @property
    def thumbnail_at(self) -> float:
        return self.start + min(1.0, self.duration / 2)

    @property
    def exports_prefix(self) -> str:
        return f"projects/{self.project_id}/exports/{self.id}/"


class WaitlistEntry(SQLModel, table=True):
    """Someone who asked to hear when Twapza launches (marketing site).

    Unlike projects this is NOT temporary data: it is kept until the person asks to be
    removed, and the schema reset in db/session.py leaves this table alone.
    """
    email: str = Field(primary_key=True, max_length=254)  # stored lower-cased
    lang: str = "en"
    created_at: datetime = Field(default_factory=utcnow)


# --- Accounts (permanent data: kept by the schema reset and the retention cleanup) ---------

class User(SQLModel, table=True):
    id: str = Field(default_factory=new_id, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=254)  # stored lower-cased
    password_hash: str
    lang: str = "en"
    created_at: datetime = Field(default_factory=utcnow)
    # When the person clicked the link in the confirmation email (None = not confirmed yet).
    # Uploading and importing videos needs a confirmed address (stops throwaway accounts).
    email_verified_at: datetime | None = None
    # Subscription, kept in sync by the Creem webhook (see accounts/billing.py).
    plan: str = "free"  # free | creator | pro (what they pay for; see accounts.plans.effective_plan)
    period: str | None = None  # monthly | yearly
    # Creem status (active, trialing, past_due, scheduled_cancel, paused, unpaid, canceled),
    # or "manual" for a plan set with `python -m twapza.users set-plan`.
    subscription_status: str | None = None
    subscription_id: str | None = Field(default=None, index=True)
    customer_id: str | None = None
    price_id: str | None = None  # the Creem product the subscription is for
    renews_at: datetime | None = None
    ends_at: datetime | None = None  # set when the subscription is cancelled at period end
    # Monthly minutes reset on this date's day of the month (sign-up, or when they subscribed).
    period_anchor: datetime | None = None
    subscription_updated_at: datetime | None = None  # when we last copied it from Creem


class AuthSession(SQLModel, table=True):
    """A login. The browser holds the token in an HttpOnly cookie; only its hash is stored."""
    token_hash: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime


class EmailVerification(SQLModel, table=True):
    """A link in the "confirm your email address" email. Only the token's hash is stored."""
    token_hash: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    expires_at: datetime


class PasswordReset(SQLModel, table=True):
    token_hash: str = Field(primary_key=True)
    user_id: str = Field(index=True)
    expires_at: datetime
    used: bool = False


class UsageEvent(SQLModel, table=True):
    """Video minutes used: one row per processed video (deleting the project doesn't refund)."""
    id: str = Field(default_factory=new_id, primary_key=True)
    user_id: str = Field(index=True)
    project_id: str | None = None
    seconds: float
    created_at: datetime = Field(default_factory=utcnow, index=True)

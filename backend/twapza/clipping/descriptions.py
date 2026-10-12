"""YouTube Shorts descriptions for clips, with a credit to the original creator.

The credit block is built from stored project fields by ``credit_text`` (never by the
model), so names and links are always exact. Claude only writes the catchy part:
a short description and a few hashtags (``ClaudeDescriber``). Without an API key,
``fallback_copy`` builds a plain description from the clip's own title/hook/text.
"""

import json
import logging
import re
from dataclasses import dataclass
from typing import Any, Protocol

from twapza.clipping.llm import HighlightError

log = logging.getLogger(__name__)

MAX_HASHTAGS = 5
MAX_DESCRIPTION_CHARS = 600


@dataclass(frozen=True)
class Credit:
    creator: str | None = None
    title: str | None = None
    video_url: str | None = None
    channel_url: str | None = None


def credit_text(credit: Credit) -> str | None:
    """The credit lines, e.g.

    Clips used from Joe Fazer’s video “I Survived Alone In The Amazon Rainforest for 4 Days”
    Original video: https://www.youtube.com/watch?v=MjtJbhuFngg
    Channel: https://www.youtube.com/@JoeFazer
    """
    creator, title = (credit.creator or "").strip(), (credit.title or "").strip()
    lines = []
    if creator and title:
        lines.append(f"Clips used from {creator}’s video “{title}”")
    elif creator:
        lines.append(f"Clips used from a video by {creator}")
    elif title:
        lines.append(f"Clips used from the video “{title}”")
    if credit.video_url:
        lines.append(f"Original video: {credit.video_url.strip()}")
    if credit.channel_url:
        lines.append(f"Channel: {credit.channel_url.strip()}")
    return "\n".join(lines) or None


def normalize_hashtags(tags: list[str] | str, *, limit: int = MAX_HASHTAGS) -> list[str]:
    """``["Amazon Survival", "#shorts", "shorts"]`` → ``["#AmazonSurvival", "#shorts"]``.

    Keeps letters/digits/underscores, drops duplicates (case-insensitive), always
    includes #shorts, and caps the count (YouTube ignores all hashtags past 15).
    """
    if isinstance(tags, str):
        tags = tags.split()
    out: list[str] = []
    seen: set[str] = set()
    for tag in [*tags, "shorts"]:
        word = re.sub(r"[^\w]", "", str(tag), flags=re.UNICODE)
        if not word or word.isdigit() or word.lower() in seen:
            continue
        seen.add(word.lower())
        out.append(f"#{word}")
    if len(out) > limit:  # keep #shorts even when the model sent many tags
        shorts = next(t for t in out if t.lower() == "#shorts")
        out = [t for t in out if t is not shorts][: limit - 1] + [shorts]
    return out


def compose(description: str, hashtags: list[str], credit: str | None) -> str:
    """Description, then the credit, then hashtags (blank lines between)."""
    parts = [description.strip(), credit or "", " ".join(hashtags)]
    return "\n\n".join(p for p in parts if p)


@dataclass(frozen=True)
class ClipCopy:
    description: str
    hashtags: list[str]


def _first_sentence(text: str, limit: int = 160) -> str:
    text = " ".join(text.split())
    match = re.match(r"(.+?[.!?])(\s|$)", text)
    sentence = match.group(1) if match else text
    return sentence if len(sentence) <= limit else sentence[: limit - 1].rsplit(" ", 1)[0] + "…"


def fallback_copy(*, title: str | None, hook: str | None, text: str) -> ClipCopy:
    """A plain description when Claude isn't available."""
    lines = [s for s in (title, f"“{hook}”" if hook else None) if s]
    if not lines and text.strip():
        lines.append(f"“{_first_sentence(text)}”")
    lines.append("Watch the full video, linked below 👇")
    return ClipCopy(description="\n".join(lines), hashtags=normalize_hashtags([]))


# --- Claude ------------------------------------------------------------------------

DESCRIPTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["description", "hashtags"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = """\
You write descriptions for YouTube Shorts that are clips from a longer video.

Write a description that makes people want to watch and follow, and helps the Short get found:
- Open with a strong hook line (curiosity, tension or a bold takeaway from the clip) that works \
in the first ~100 characters, because that is what shows in the feed.
- Then one or two short lines of context. Use the words people would search for, naturally.
- End with a short call to action that sends viewers to the full video (it is linked below \
the description), e.g. "Full video linked below 👇".
- 2-4 lines and under 400 characters in total. Emojis are fine but use at most two.
- Stay truthful to what is said in the clip. No invented facts, no misleading clickbait.
- Write in the language of the transcript.
- Do not include links, @mentions, a credit line or hashtags in the description: \
the credit to the original creator and the hashtags are added separately.
- Never present the uploader as the person in the video or as the original creator.

Also give 3-5 hashtags relevant to the clip's topic (without the # sign is fine). \
"shorts" is added automatically.
"""


def user_prompt(*, clip_text: str, clip_title: str | None, clip_hook: str | None,
                duration: float, credit: Credit) -> str:
    parts = []
    if credit.title:
        parts.append(f"Original video title: {credit.title}")
    if credit.creator:
        parts.append(f"Original creator: {credit.creator}")
    if clip_title:
        parts.append(f"Clip title: {clip_title}")
    if clip_hook:
        parts.append(f"Clip hook: {clip_hook}")
    parts.append(f"Clip length: {duration:.0f} seconds")
    parts.append(f"Transcript of the clip:\n<transcript>\n{clip_text.strip() or '(no speech)'}\n</transcript>")
    return "\n".join(parts)


def parse_copy(raw: str) -> ClipCopy | None:
    """Tolerant: returns None when the output has no usable description."""
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        match = re.search(r"\{.*\}", raw or "", re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except ValueError:
            return None
    if not isinstance(data, dict):
        return None
    description = str(data.get("description") or "").strip()
    if not description:
        return None
    tags = data.get("hashtags")
    tags = [str(t) for t in tags] if isinstance(tags, list) else str(tags or "").split()
    # Hashtags belong on their own line, not inside the text.
    description = re.sub(r"(?:\s*#\w+)+\s*$", "", description).strip() or description
    return ClipCopy(description=description[:MAX_DESCRIPTION_CHARS].strip(),
                    hashtags=normalize_hashtags(tags))


class Describer(Protocol):
    def write(self, prompt: str) -> str: ...


class ClaudeDescriber:
    """One short structured-output request per clip."""

    def __init__(self, *, api_key: str, model: str, effort: str = "medium", client: Any = None):
        import anthropic

        self.model = model
        self.effort = effort
        self.client = client or anthropic.Anthropic(api_key=api_key, max_retries=3)

    def write(self, prompt: str) -> str:
        import anthropic

        try:
            with self.client.beta.messages.stream(
                model=self.model,
                max_tokens=16000,
                system=SYSTEM_PROMPT,
                messages=[{"role": "user", "content": prompt}],
                output_config={"effort": self.effort,
                               "format": {"type": "json_schema", "schema": DESCRIPTION_SCHEMA}},
                # If a safety classifier declines, retry on a fallback model server-side.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            ) as stream:
                message = stream.get_final_message()
        except anthropic.AuthenticationError:
            raise HighlightError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.") from None
        except anthropic.PermissionDeniedError:
            raise HighlightError("The Anthropic API key isn't allowed to use this model.") from None
        except anthropic.NotFoundError:
            raise HighlightError(f"Model {self.model!r} was not found. Check TWAPZA_CLAUDE_MODEL.") from None
        except anthropic.RateLimitError:
            raise HighlightError("Claude API rate limit reached. Wait a minute and try again.") from None
        except anthropic.APIStatusError as exc:
            raise HighlightError(f"Claude API error ({exc.status_code}): {exc.message}") from None
        except anthropic.APIConnectionError:
            raise HighlightError("Could not reach the Claude API. Check the internet connection.") from None

        if message.stop_reason == "refusal":
            log.warning("description refused (%s)", getattr(message.stop_details, "category", None))
            return ""
        return "".join(block.text for block in message.content if block.type == "text")

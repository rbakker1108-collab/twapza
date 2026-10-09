"""Feature 2: ask Claude for the strongest standalone moments in a transcript.

Pure parts (chunking, prompt building, output parsing) are separate from the
API call (``ClaudeHighlighter``) so they can be tested without the network.
"""

import json
import logging
import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any, Protocol

from twapza.clipping.snapping import word_strength
from twapza.transcription.base import Transcript, Word

log = logging.getLogger(__name__)


# --- transcript → timestamped lines → chunks -----------------------------------

@dataclass(frozen=True)
class Line:
    start: float
    end: float
    text: str


@dataclass(frozen=True)
class Chunk:
    index: int
    start: float
    end: float
    lines: list[Line]

    def render(self) -> str:
        return "\n".join(f"[{line.start:.1f}] {line.text}" for line in self.lines)


def transcript_lines(words: Sequence[Word], *, pause: float = 1.0, max_words: int = 30) -> list[Line]:
    """Group words into sentence-like lines (split at sentence ends, long pauses or max length)."""
    ordered = sorted(words, key=lambda w: w.start)
    lines: list[Line] = []
    current: list[Word] = []
    for i, word in enumerate(ordered):
        current.append(word)
        nxt = ordered[i + 1] if i + 1 < len(ordered) else None
        long_pause = nxt is not None and nxt.start - word.end >= pause
        if word_strength(word.text) == 2 or long_pause or len(current) >= max_words or nxt is None:
            text = " ".join(w.text.strip() for w in current if w.text.strip())
            if text:
                lines.append(Line(start=current[0].start, end=current[-1].end, text=text))
            current = []
    return lines


def chunk_lines(lines: Sequence[Line], *, chunk_seconds: float = 480, overlap: float = 60) -> list[Chunk]:
    """Split lines into overlapping time windows so moments near a boundary aren't lost."""
    if not lines:
        return []
    if overlap >= chunk_seconds:
        raise ValueError("overlap must be smaller than chunk_seconds")
    chunks: list[Chunk] = []
    start = lines[0].start
    last_end = lines[-1].end
    while True:
        end = start + chunk_seconds
        selected = [ln for ln in lines if start <= ln.start < end]
        if selected:
            chunks.append(Chunk(index=len(chunks), start=selected[0].start,
                                end=max(ln.end for ln in selected), lines=selected))
        if end >= last_end:
            return chunks
        start = end - overlap


def chunk_transcript(transcript: Transcript, *, chunk_seconds: float = 480,
                     overlap: float = 60) -> list[Chunk]:
    return chunk_lines(transcript_lines(transcript.words), chunk_seconds=chunk_seconds,
                       overlap=overlap)


# --- prompt ----------------------------------------------------------------------

SYSTEM_PROMPT = """\
You are an experienced short-form video editor. Creators upload their own long-form \
videos (podcasts, talks, interviews, streams, tutorials) and you pick the moments that \
will work best as standalone vertical clips on YouTube Shorts, TikTok and Instagram Reels.

You receive part of a transcript. Each line starts with its start time in seconds, \
like "[734.2] text". Pick the strongest standalone moments in this part. A strong moment:
- hooks the viewer in its first 3 seconds: a bold claim, a question, a surprising \
statement or a strong emotion, with no warm-up
- makes sense without the rest of the video: no unexplained "as I said", "this" or \
"he" that depends on earlier context
- has a payoff: a clear takeaway, a punchline, an emotional peak, a reveal or a \
satisfying conclusion
- is between 15 and 90 seconds long (30-60 seconds is ideal)
- starts at the beginning of a sentence and ends at the end of one

Humour, surprising facts, strong opinions, personal stories, emotional peaks and \
practical tips usually perform well. Rambling, logistics ("let me share my screen"), \
greetings, sponsor reads and anything that needs earlier context usually do not.

For each moment give:
- start, end: times in seconds, taken from the line timestamps (end = when the last \
sentence of the moment finishes, so use the start time of the following line)
- title: a short, catchy title for the clip (max 60 characters), in the language of \
the transcript
- hook: the opening words a viewer hears, quoted from the transcript
- score: 0-100, how well it will perform as a short; be honest and spread the scores \
(90+ only for truly exceptional moments)
- reason: one sentence on why it works

Return at most {max_per_chunk} moments, best first. If nothing in this part would make \
a good short, return an empty list. Never invent words that are not in the transcript."""

HIGHLIGHT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "clips": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "start": {"type": "number"},
                    "end": {"type": "number"},
                    "title": {"type": "string"},
                    "hook": {"type": "string"},
                    "score": {"type": "integer"},
                    "reason": {"type": "string"},
                },
                "required": ["start", "end", "title", "hook", "score", "reason"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["clips"],
    "additionalProperties": False,
}


def system_prompt(max_per_chunk: int = 5) -> str:
    return SYSTEM_PROMPT.format(max_per_chunk=max_per_chunk)


def user_prompt(chunk: Chunk, *, video_title: str, video_duration: float, total_chunks: int) -> str:
    return (
        f"Video: {video_title}\n"
        f"Total length: {video_duration:.0f} seconds. This is part {chunk.index + 1} of "
        f"{total_chunks}, covering {chunk.start:.0f}s to {chunk.end:.0f}s.\n\n"
        f"<transcript>\n{chunk.render()}\n</transcript>"
    )


# --- parsing the model's answer -----------------------------------------------------

@dataclass(frozen=True)
class Candidate:
    start: float
    end: float
    title: str
    hook: str
    score: float
    reason: str

    @property
    def duration(self) -> float:
        return self.end - self.start


_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)
_TIMESTAMP = re.compile(r"^\s*(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)\s*$")


def _load_json(raw: str) -> Any:
    """Parse JSON that may be wrapped in a code fence or surrounded by prose."""
    text = raw.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    for block in _FENCE.findall(text):
        try:
            return json.loads(block.strip())
        except json.JSONDecodeError:
            continue
    # Outermost {...} or [...] in the text, trying whichever bracket opens first
    # (so "Sure! [{...}]" yields the list, not the first object inside it).
    pairs = sorted((("{", "}"), ("[", "]")),
                   key=lambda p: text.find(p[0]) if p[0] in text else len(text))
    for open_ch, close_ch in pairs:
        first, last = text.find(open_ch), text.rfind(close_ch)
        if first != -1 and last > first:
            try:
                return json.loads(text[first:last + 1])
            except json.JSONDecodeError:
                continue
    raise ValueError("no JSON found in model output")


def _seconds(value: Any) -> float | None:
    """Accept 123.4, "123.4", "2:03" or "1:02:03.5"."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, str):
        value = value.strip().rstrip("s")
        try:
            return float(value)
        except ValueError:
            match = _TIMESTAMP.match(value)
            if match:
                h, m, s = match.groups()
                return int(h or 0) * 3600 + int(m) * 60 + float(s)
    return None


def _text(value: Any, limit: int) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())[:limit]


def parse_highlights(
    raw: str | dict | list,
    *,
    chunk_start: float,
    chunk_end: float,
    min_len: float = 15,
    max_len: float = 90,
    tolerance: float = 3.0,
) -> list[Candidate]:
    """Validate and normalise the model's suggestions. Never raises on bad items.

    - Accepts ``{"clips": [...]}``, a bare list, or JSON wrapped in prose / code fences.
    - Times may be numbers, numeric strings or ``m:ss`` timestamps; start/end are swapped
      if reversed and clamped to the chunk.
    - Clips shorter than ``min_len`` (beyond ``tolerance``) are dropped; longer than
      ``max_len`` are cut to ``max_len`` (the refinement step snaps the end to a sentence).
    - ``score`` is coerced to 0-100 (missing → 50); text fields are trimmed.
    """
    try:
        data = _load_json(raw) if isinstance(raw, str) else raw
    except ValueError:
        log.warning("could not parse highlight output: %.200s", raw)
        return []
    items = data.get("clips", data.get("highlights", [])) if isinstance(data, dict) else data
    if not isinstance(items, list):
        return []

    out: list[Candidate] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        start, end = _seconds(item.get("start")), _seconds(item.get("end"))
        if start is None or end is None:
            continue
        if start > end:
            start, end = end, start
        start = max(start, chunk_start)
        end = min(end, chunk_end)
        if end - start < min_len - tolerance:
            continue
        if end - start > max_len:
            end = start + max_len
        try:
            score = float(item.get("score", 50))
        except (TypeError, ValueError):
            score = 50.0
        if score != score:  # NaN
            score = 50.0
        out.append(Candidate(
            start=round(start, 3), end=round(end, 3),
            title=_text(item.get("title"), 100) or "Untitled moment",
            hook=_text(item.get("hook"), 300),
            score=max(0.0, min(100.0, score)),
            reason=_text(item.get("reason"), 500),
        ))
    return out


# --- the API call --------------------------------------------------------------------

class HighlightFinder(Protocol):
    def find(self, chunk: Chunk, *, video_title: str, video_duration: float,
             total_chunks: int) -> str:
        """Return the raw JSON text the model produced for this chunk."""
        ...


class HighlightError(Exception):
    """A failure with a message meant for the user."""


class ClaudeHighlighter:
    """Calls the Claude API with a JSON-schema-constrained output."""

    def __init__(self, *, api_key: str, model: str, effort: str = "high", max_per_chunk: int = 5,
                 client: Any = None):
        import anthropic

        self.model = model
        self.effort = effort
        self.system = system_prompt(max_per_chunk)
        self.client = client or anthropic.Anthropic(api_key=api_key, max_retries=4)

    def find(self, chunk: Chunk, *, video_title: str, video_duration: float,
             total_chunks: int) -> str:
        import anthropic

        try:
            # Stream so long thinking + output never hits an HTTP timeout.
            with self.client.beta.messages.stream(
                model=self.model,
                max_tokens=32000,
                # Stable across chunks, so it is cached after the first request.
                system=[{"type": "text", "text": self.system, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": user_prompt(
                    chunk, video_title=video_title, video_duration=video_duration,
                    total_chunks=total_chunks)}],
                output_config={"effort": self.effort,
                               "format": {"type": "json_schema", "schema": HIGHLIGHT_SCHEMA}},
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
            log.warning("chunk %s refused (%s)", chunk.index,
                        getattr(message.stop_details, "category", None))
            return '{"clips": []}'
        if message.stop_reason == "max_tokens":
            log.warning("chunk %s hit max_tokens; output may be truncated", chunk.index)
        return "".join(block.text for block in message.content if block.type == "text")


__all__ = [
    "Candidate", "Chunk", "ClaudeHighlighter", "HighlightError",
    "HighlightFinder", "Line", "chunk_lines", "chunk_transcript", "parse_highlights",
    "system_prompt", "transcript_lines", "user_prompt",
]

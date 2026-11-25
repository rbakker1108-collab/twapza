"""Caption translation: subtitles in another language than the one spoken.

The transcript is split into sentences; Claude translates each sentence once (cached per project
and language as ``{sentence key: translated text}``), and ``retime`` spreads the translated words
over the time the original words were spoken. Because the translated words only ever sit inside
original word intervals, the rest of the pipeline (word-by-word highlight, cut pauses, cold open,
.srt) works on them unchanged. Everything here is pure except ``ClaudeTranslator``.

Only languages our bundled caption fonts can draw are offered (Latin script and Arabic).
"""

import json
import logging
import re
from collections.abc import Sequence
from typing import Any, Literal, Protocol

from twapza.clipping.llm import HighlightError
from twapza.clipping.snapping import word_strength
from twapza.clipping.timeline import is_filler
from twapza.transcription.base import Word

log = logging.getLogger(__name__)

# Target languages (code -> English name for the prompt). Keep in sync with the frontend
# (CAPTION_LANGUAGES in components/ExportOptions.tsx).
Language = Literal["en", "es", "fr", "de", "nl", "pt", "it", "ar"]
LANGUAGES: dict[str, str] = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "nl": "Dutch",
    "pt": "Portuguese",
    "it": "Italian",
    "ar": "Arabic",
}

MAX_SENTENCE_WORDS = 40
LINES_PER_REQUEST = 120
MIN_WORD = 0.02  # s


def sentence_key(first: Word) -> str:
    return f"{first.start:.3f}"


def split_sentences(words: Sequence[Word]) -> list[list[Word]]:
    """Spoken words (no fillers, no hidden words) grouped into sentences, in time order."""
    spoken = [w for w in sorted(words, key=lambda w: w.start) if w.text.strip() and not is_filler(w)]
    out: list[list[Word]] = []
    current: list[Word] = []
    for i, w in enumerate(spoken):
        current.append(w)
        nxt = spoken[i + 1] if i + 1 < len(spoken) else None
        if (nxt is None or word_strength(w.text) == 2 or nxt.start - w.end > 0.8
                or len(current) >= MAX_SENTENCE_WORDS):
            out.append(current)
            current = []
    return out


def sentence_text(sentence: Sequence[Word]) -> str:
    return " ".join(" ".join(w.text.split()) for w in sentence).strip()


def overlapping(sentences: Sequence[Sequence[Word]], start: float, end: float) -> list[Sequence[Word]]:
    return [s for s in sentences if s[-1].end > start and s[0].start < end]


def retime(sentence: Sequence[Word], text: str) -> list[Word]:
    """The translated ``text`` as words spread over the time the original words were spoken,
    weighted by length. Each word stays inside one original word interval."""
    tokens = text.split()
    if not tokens or not sentence:
        return []
    slots = [(w.start, w.end) for w in sentence if w.end - w.start > 0]
    if not slots:
        slots = [(sentence[0].start, max(sentence[-1].end, sentence[0].start + 0.3))]
    total = sum(e - s for s, e in slots)

    def at(position: float) -> tuple[float, int]:
        """Real time (and slot index) at ``position`` seconds into the spoken time."""
        for i, (s, e) in enumerate(slots):
            if position <= e - s or i == len(slots) - 1:
                return s + min(position, e - s), i
            position -= e - s
        return slots[-1][1], len(slots) - 1  # pragma: no cover

    weights = [len(t) + 1 for t in tokens]
    scale = total / sum(weights)
    out, done = [], 0.0
    for token, weight in zip(tokens, weights):
        a, _ = at(done * scale)
        b, _ = at((done + weight) * scale)
        _, slot = at((done + weight / 2) * scale)
        done += weight
        s, e = slots[slot]
        a, b = max(a, s), min(b, e)
        if b - a < MIN_WORD:
            a = max(s, min(a, e - MIN_WORD))
            b = min(e, a + MIN_WORD)
        out.append(Word(text=f" {token}", start=round(a, 3), end=round(b, 3)))
    return out


def translated_words(words: Sequence[Word], translations: dict[str, str]) -> list[Word]:
    """The transcript's words with every translated sentence replaced by its translation."""
    out: list[Word] = []
    for sentence in split_sentences(words):
        text = translations.get(sentence_key(sentence[0]))
        out.extend(retime(sentence, text) if text is not None else sentence)
    return out


# --- Claude ------------------------------------------------------------------------

TRANSLATION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "lines": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"id": {"type": "integer"}, "text": {"type": "string"}},
                "required": ["id", "text"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["lines"],
    "additionalProperties": False,
}


def system_prompt(language: str) -> str:
    return f"""\
You translate subtitles for short videos into {LANGUAGES[language]}.

Each input line is one spoken sentence (or part of one) from a transcript, with an id. Return \
every id exactly once with its translation:
- Natural, spoken {LANGUAGES[language]}, the way a native speaker would say it, not word for word.
- Keep it about as short as the original: subtitles are read quickly.
- Keep names, brands and numbers as they are.
- Translate each line on its own; never merge or split lines. A line that is already in \
{LANGUAGES[language]} stays as it is.
- Only the translation: no notes, quotes or explanations.
"""


def user_prompt(lines: Sequence[tuple[int, str]]) -> str:
    body = "\n".join(f"{i}\t{text}" for i, text in lines)
    return f"Translate these subtitle lines (id, tab, text):\n<lines>\n{body}\n</lines>"


def parse_translation(raw: str, ids: Sequence[int]) -> dict[int, str]:
    """Tolerant: the usable lines for the requested ids (missing ones are left out)."""
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        match = re.search(r"\{.*\}", raw or "", re.DOTALL)
        try:
            data = json.loads(match.group(0)) if match else None
        except ValueError:
            data = None
    items = data.get("lines") if isinstance(data, dict) else None
    wanted = set(ids)
    out: dict[int, str] = {}
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        try:
            i = int(item.get("id"))
        except (TypeError, ValueError):
            continue
        text = " ".join(str(item.get("text") or "").split())
        if i in wanted and text:
            out[i] = text
    return out


class Translator(Protocol):
    def translate(self, lines: Sequence[str], language: str) -> list[str | None]: ...


class ClaudeTranslator:
    """Structured-output requests of up to ``LINES_PER_REQUEST`` lines each."""

    def __init__(self, *, api_key: str, model: str, effort: str = "low", client: Any = None):
        import anthropic

        self.model = model
        self.effort = effort
        self.client = client or anthropic.Anthropic(api_key=api_key, max_retries=3)

    def translate(self, lines: Sequence[str], language: str) -> list[str | None]:
        out: list[str | None] = [None] * len(lines)
        for start in range(0, len(lines), LINES_PER_REQUEST):
            batch = list(enumerate(lines[start:start + LINES_PER_REQUEST], start=start))
            got = parse_translation(self._ask(language, user_prompt(batch)), [i for i, _ in batch])
            for i, text in got.items():
                out[i] = text
        return out

    def _ask(self, language: str, prompt: str) -> str:
        import anthropic

        try:
            with self.client.beta.messages.stream(
                model=self.model,
                max_tokens=32000,
                system=system_prompt(language),
                messages=[{"role": "user", "content": prompt}],
                output_config={"effort": self.effort,
                               "format": {"type": "json_schema", "schema": TRANSLATION_SCHEMA}},
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            ) as stream:
                message = stream.get_final_message()
        except anthropic.AuthenticationError:
            raise HighlightError("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in .env.") from None
        except anthropic.RateLimitError:
            raise HighlightError("Claude API rate limit reached. Wait a minute and try again.") from None
        except anthropic.APIStatusError as exc:
            raise HighlightError(f"Claude API error ({exc.status_code}): {exc.message}") from None
        except anthropic.APIConnectionError:
            raise HighlightError("Could not reach the Claude API. Check the internet connection.") from None
        if message.stop_reason == "refusal":
            log.warning("translation refused (%s)", getattr(message.stop_details, "category", None))
            return ""
        return "".join(block.text for block in message.content if block.type == "text")

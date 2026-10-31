"""The edit of an exported clip: which parts of the source play, in what order.

A clip normally plays ``[start, end]`` of the source as one segment. Two optional
retention boosts change that:

- **cut pauses** (``remove_pauses``): drop silences between words longer than
  ``max_gap``, leaving a short breath, for snappier pacing (jump cuts);
- **cold open** (``with_cold_open``): play the clip's most gripping line first
  as a 1.5-6 s teaser, then the clip from the beginning.

Captions and .srt files follow the edited timeline via ``map_words``.
Everything here is pure; ``media/ffmpeg.py::cut_segments`` renders the result.
"""

import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from twapza.clipping.snapping import word_strength
from twapza.transcription.base import Word

MAX_GAP = 0.45       # silences longer than this (s) are shortened …
KEEP_GAP = 0.2       # … to this much (split around the cut, so speech isn't clipped)
MIN_SEGMENT = 0.08   # drop slivers shorter than this (s)
TEASER_MIN, TEASER_MAX = 1.5, 6.0


@dataclass(frozen=True)
class Segment:
    start: float
    end: float

    @property
    def length(self) -> float:
        return self.end - self.start


@dataclass(frozen=True)
class TimedWord:
    text: str
    start: float
    end: float


def total_length(segments: Sequence[Segment]) -> float:
    return sum(s.length for s in segments)


def _clip_words(words: Sequence[Word], start: float, end: float) -> list[Word]:
    return [w for w in sorted(words, key=lambda w: w.start)
            if w.text.strip() and w.end > start and w.start < end]


def remove_pauses(words: Sequence[Word], start: float, end: float, *,
                  max_gap: float = MAX_GAP, keep: float = KEEP_GAP) -> list[Segment]:
    """``[start, end]`` without silences longer than ``max_gap`` (each shortened to ``keep``).

    Silence before the first and after the last word is trimmed too (keeping
    ``keep`` of lead-in and a little more tail so the last word can ring out).
    """
    spoken = _clip_words(words, start, end)
    if not spoken:
        return [Segment(start, end)]
    half = keep / 2
    cuts: list[tuple[float, float]] = []
    if spoken[0].start - start > max_gap:
        cuts.append((start, spoken[0].start - keep))
    for a, b in zip(spoken, spoken[1:]):
        if b.start - a.end > max_gap:
            cuts.append((a.end + half, b.start - half))
    if end - spoken[-1].end > max_gap + keep:
        cuts.append((spoken[-1].end + 2 * keep, end))

    segments: list[Segment] = []
    cursor = start
    for c0, c1 in cuts:
        if c0 - cursor >= MIN_SEGMENT:
            segments.append(Segment(round(cursor, 3), round(c0, 3)))
        cursor = max(cursor, c1)
    if end - cursor >= MIN_SEGMENT:
        segments.append(Segment(round(cursor, 3), round(end, 3)))
    return segments or [Segment(start, end)]


def with_cold_open(segments: Sequence[Segment], teaser: Segment | None) -> list[Segment]:
    """The teaser first, then the clip (the teaser line plays again in context)."""
    return [teaser, *segments] if teaser else list(segments)


def map_words(words: Sequence[Word], segments: Sequence[Segment]) -> list[TimedWord]:
    """Words as they appear in the edited clip, with times on the output timeline."""
    out: list[TimedWord] = []
    offset = 0.0
    ordered = sorted(words, key=lambda w: w.start)
    for seg in segments:
        for w in ordered:
            text = " ".join(w.text.split())
            if not text or w.end <= seg.start or w.start >= seg.end:
                continue
            s = max(w.start, seg.start) - seg.start + offset
            e = min(w.end, seg.end) - seg.start + offset
            if e - s > 0.01:
                out.append(TimedWord(text=text, start=round(s, 3), end=round(e, 3)))
        offset += seg.length
    return out


# --- choosing the teaser -----------------------------------------------------------

def _norm(text: str) -> str:
    return re.sub(r"[^\w']+", "", text.lower(), flags=re.UNICODE)


def _teaser_span(first: Word, last: Word, start: float, end: float) -> Segment | None:
    s, e = max(start, first.start - 0.05), min(end, last.end + 0.15)
    if e - s < TEASER_MIN:
        return None
    return Segment(round(s, 3), round(min(e, s + TEASER_MAX), 3))


def find_quote(words: Sequence[Word], quote: str, start: float, end: float) -> Segment | None:
    """Where ``quote`` is spoken inside ``[start, end]`` (exact word match, punctuation ignored).

    Falls back to matching the quote's first 4 words, then extends to the end of that sentence.
    """
    spoken = [w for w in _clip_words(words, start, end) if _norm(w.text)]
    target = [t for t in (_norm(t) for t in quote.split()) if t]
    if not spoken or len(target) < 2:
        return None
    tokens = [_norm(w.text) for w in spoken]
    for n in (len(target), min(4, len(target))):
        for i in range(len(tokens) - n + 1):
            if tokens[i:i + n] == target[:n]:
                j = i + n - 1
                if n < len(target):  # partial match: run on to the end of the sentence
                    while j + 1 < len(spoken) and word_strength(spoken[j].text) < 2 and j - i < 20:
                        j += 1
                return _teaser_span(spoken[i], spoken[j], start, end)
    return None


def sentences(words: Sequence[Word], start: float, end: float) -> list[tuple[Word, Word]]:
    """(first word, last word) of each sentence-like run inside the clip."""
    spoken = _clip_words(words, start, end)
    out, first = [], None
    for i, w in enumerate(spoken):
        first = first or w
        nxt = spoken[i + 1] if i + 1 < len(spoken) else None
        if nxt is None or word_strength(w.text) == 2 or nxt.start - w.end > 0.8:
            out.append((first, w))
            first = None
    return out


def pick_teaser(words: Sequence[Word], start: float, end: float,
                loudness: Callable[[float, float], float] | None = None) -> Segment | None:
    """The best teaser when no quote is known: a 1.5-6 s sentence that isn't the opening one.

    Ranked by loudness (when known: excitement, laughter), then by ! / ? endings,
    then by length closest to 3 s.
    """
    best, best_key = None, None
    for idx, (a, b) in enumerate(sentences(words, start, end)):
        if idx == 0:
            continue  # the clip starts with it anyway
        span = _teaser_span(a, b, start, end)
        if span is None or b.end - a.start > TEASER_MAX + 0.5:
            continue
        loud = loudness(span.start, span.end) if loudness else 0.0
        punch = 1 if b.text.strip()[-1:] in "!?" else 0
        key = (round(loud, 1), punch, -abs(span.length - 3.0))
        if best_key is None or key > best_key:
            best, best_key = span, key
    return best

"""Snap cut points to natural pauses / sentence boundaries.

Pure functions only: given word timestamps and a target time, pick the best
place to cut within a window around the target.

A *boundary* is the gap between two consecutive words. Each boundary is scored
by how long the pause is, whether the preceding word ends a sentence or clause,
and how far it is from the target. A cut is expressed as two times: where the
preceding clip ``end``s and where the following clip ``start``s. Both sit inside
the gap, padded slightly away from the words so speech is never clipped; long
silences are therefore dropped between consecutive clips rather than included.
"""

import bisect
from collections.abc import Sequence
from dataclasses import dataclass

from twapza.transcription.base import Word

SENTENCE_END = (".", "?", "!", "…", "。", "？", "！")
CLAUSE_END = (",", ";", ":", "—", "–", "，", "；", "：")
_TRAILING = "\"'”’)]}»"

# Scoring weights (see score_boundary).
PAUSE_CAP = 1.0          # pauses longer than this (s) score the same
W_PAUSE = 1.0
W_STRENGTH = {0: 0.0, 1: 0.5, 2: 1.2}
W_DISTANCE = 0.8
EDGE_PAD = 0.25          # keep cuts this far (s) from speech when the gap allows


@dataclass(frozen=True)
class Boundary:
    gap_start: float     # end of the preceding word
    gap_end: float       # start of the following word
    strength: int        # 2 = sentence end, 1 = clause end, 0 = plain word gap

    @property
    def pause(self) -> float:
        return self.gap_end - self.gap_start


@dataclass(frozen=True)
class Cut:
    end: float           # where the clip before the cut ends
    start: float         # where the clip after the cut starts


def word_strength(text: str) -> int:
    token = text.strip().rstrip(_TRAILING)
    if token.endswith(SENTENCE_END):
        return 2
    if token.endswith(CLAUSE_END):
        return 1
    return 0


def find_boundaries(words: Sequence[Word]) -> list[Boundary]:
    """Boundaries between consecutive words, ordered by time."""
    ordered = sorted(words, key=lambda w: w.start)
    boundaries = []
    for prev, nxt in zip(ordered, ordered[1:]):
        a, b = prev.end, nxt.start
        if b < a:  # overlapping timestamps: collapse to the midpoint
            a = b = (a + b) / 2
        boundaries.append(Boundary(gap_start=a, gap_end=b, strength=word_strength(prev.text)))
    return boundaries


def _distance(b: Boundary, target: float) -> float:
    if b.gap_start <= target <= b.gap_end:
        return 0.0
    return min(abs(b.gap_start - target), abs(b.gap_end - target))


def score_boundary(b: Boundary, target: float, window: float) -> float:
    pause = min(b.pause, PAUSE_CAP) / PAUSE_CAP
    distance = _distance(b, target) / window if window > 0 else 0.0
    return W_PAUSE * pause + W_STRENGTH[b.strength] - W_DISTANCE * distance


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def snap_cut(
    target: float,
    boundaries: Sequence[Boundary],
    *,
    window: float = 5.0,
    lo: float | None = None,
    hi: float | None = None,
) -> Cut:
    """Best cut for ``target`` using boundaries within ``[target-window, target+window]``.

    ``lo``/``hi`` further restrict where the cut may land (e.g. to respect
    minimum clip lengths). ``boundaries`` must be sorted by time. Falls back to
    the (clamped) target when no boundary lies in range, e.g. during silence or
    when there is no transcript.
    """
    lo = target - window if lo is None else max(lo, target - window)
    hi = target + window if hi is None else min(hi, target + window)
    if lo > hi:
        lo = hi = _clamp(target, hi, lo)

    # Boundaries whose gap intersects [lo, hi].
    gap_ends = [b.gap_end for b in boundaries]
    first = bisect.bisect_left(gap_ends, lo)
    best: Boundary | None = None
    best_score = float("-inf")
    for b in boundaries[first:]:
        if b.gap_start > hi:
            break
        s = score_boundary(b, target, window)
        if s > best_score:
            best, best_score = b, s

    if best is None:
        t = _clamp(target, lo, hi)
        return Cut(end=t, start=t)

    mid = (best.gap_start + best.gap_end) / 2
    end = min(best.gap_start + EDGE_PAD, mid)
    start = max(best.gap_end - EDGE_PAD, mid)
    # A long silence may extend past the allowed range: stay inside it.
    end = _clamp(end, max(lo, best.gap_start), min(hi, best.gap_end))
    start = _clamp(start, max(lo, best.gap_start), min(hi, best.gap_end))
    if start < end:
        start = end
    return Cut(end=round(end, 3), start=round(start, 3))

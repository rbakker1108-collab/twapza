"""Remove overlapping highlight candidates (greedy non-maximum suppression)."""

from collections.abc import Sequence
from typing import Protocol, TypeVar


class _Span(Protocol):
    @property
    def start(self) -> float: ...
    @property
    def end(self) -> float: ...
    @property
    def score(self) -> float: ...


T = TypeVar("T", bound=_Span)


def overlap(a: _Span, b: _Span) -> float:
    """Seconds of overlap between two spans."""
    return max(0.0, min(a.end, b.end) - max(a.start, b.start))


def iou(a: _Span, b: _Span) -> float:
    inter = overlap(a, b)
    union = (a.end - a.start) + (b.end - b.start) - inter
    return inter / union if union > 0 else 0.0


def containment(a: _Span, b: _Span) -> float:
    """Fraction of the shorter span covered by the other."""
    shorter = min(a.end - a.start, b.end - b.start)
    return overlap(a, b) / shorter if shorter > 0 else 0.0


def dedupe(
    candidates: Sequence[T],
    *,
    iou_threshold: float = 0.5,
    containment_threshold: float = 0.7,
    limit: int | None = None,
) -> list[T]:
    """Keep the best-scoring candidates, dropping any that substantially overlap one already kept.

    Two clips are duplicates when their intersection-over-union reaches ``iou_threshold``
    or when one mostly contains the other (``containment_threshold`` of the shorter one).
    Ties on score prefer the earlier clip, so the result is deterministic. Returned
    best-first, at most ``limit`` items.
    """
    ranked = sorted(candidates, key=lambda c: (-c.score, c.start, c.end))
    kept: list[T] = []
    for cand in ranked:
        if cand.end <= cand.start:
            continue
        if any(iou(cand, k) >= iou_threshold or containment(cand, k) >= containment_threshold
               for k in kept):
            continue
        kept.append(cand)
        if limit is not None and len(kept) >= limit:
            break
    return kept

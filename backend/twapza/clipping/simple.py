"""Feature 1: split a video into ~N-second clips with snapped cut points."""

from collections.abc import Sequence
from dataclasses import dataclass

from twapza.clipping.snapping import find_boundaries, snap_cut
from twapza.transcription.base import Word


@dataclass(frozen=True)
class Span:
    start: float
    end: float

    @property
    def duration(self) -> float:
        return self.end - self.start


def plan_simple_clips(
    duration: float,
    words: Sequence[Word],
    target_len: float,
    *,
    window: float = 5.0,
    min_len: float = 15.0,
) -> list[Span]:
    """Cover ``[0, duration]`` with consecutive clips of about ``target_len`` seconds.

    Each cut is placed ``target_len`` after the previous clip's start and then
    snapped to the best pause/sentence boundary within ``±window`` seconds.
    Every clip is at least ``min_len`` long, except when the whole video is
    shorter; a short remainder at the end is merged into the last clip.
    """
    if duration <= 0:
        return []
    if target_len <= 0:
        raise ValueError("target_len must be positive")

    boundaries = find_boundaries(words)
    spans: list[Span] = []
    start = 0.0
    while True:
        remaining = duration - start
        # Not enough left for this clip plus a minimum-length clip after it.
        if remaining < target_len + min_len:
            spans.append(Span(round(start, 3), round(duration, 3)))
            return spans
        target = start + target_len
        cut = snap_cut(
            target, boundaries, window=window,
            lo=start + min_len, hi=duration - min_len,
        )
        spans.append(Span(round(start, 3), cut.end))
        start = cut.start

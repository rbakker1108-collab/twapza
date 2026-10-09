from dataclasses import dataclass

import pytest

from twapza.clipping.dedupe import containment, dedupe, iou, overlap


@dataclass(frozen=True)
class S:
    start: float
    end: float
    score: float = 50


def test_overlap_metrics():
    assert overlap(S(0, 10), S(5, 20)) == 5
    assert overlap(S(0, 10), S(10, 20)) == 0  # touching is not overlapping
    assert iou(S(0, 10), S(5, 15)) == pytest.approx(5 / 15)
    assert containment(S(0, 60), S(10, 30)) == 1.0
    assert iou(S(0, 0), S(0, 0)) == 0.0


def test_keeps_best_of_overlapping_pair():
    a, b = S(100, 140, 70), S(105, 145, 90)
    assert dedupe([a, b]) == [b]


def test_keeps_clips_that_only_touch_or_overlap_a_little():
    a, b, c = S(0, 40, 80), S(40, 80, 70), S(75, 120, 60)  # c overlaps b by 5s
    assert dedupe([c, a, b]) == [a, b, c]


def test_drops_clip_contained_in_a_better_one():
    long, inner = S(0, 90, 85), S(20, 45, 80)  # iou 0.28, containment 1.0
    assert dedupe([inner, long]) == [long]


def test_contained_clip_survives_if_better_but_then_container_is_dropped():
    long, inner = S(0, 90, 60), S(20, 45, 95)
    assert dedupe([long, inner]) == [inner]


def test_duplicates_from_overlapping_chunks_collapse():
    # The same moment suggested by two neighbouring transcript chunks
    cands = [S(470, 520, 88), S(471.5, 519, 85), S(300, 340, 60)]
    assert dedupe(cands) == [S(470, 520, 88), S(300, 340, 60)]


def test_result_is_best_first_limited_and_deterministic():
    cands = [S(i * 100, i * 100 + 30, score) for i, score in enumerate([50, 90, 70, 90, 10])]
    out = dedupe(cands, limit=3)
    assert [c.score for c in out] == [90, 90, 70]
    assert out[0].start < out[1].start  # ties broken by time
    assert dedupe(list(reversed(cands)), limit=3) == out


def test_thresholds_are_configurable_and_invalid_spans_skipped():
    a, b = S(0, 40, 90), S(20, 60, 80)  # iou 1/3
    assert dedupe([a, b]) == [a, b]
    assert dedupe([a, b], iou_threshold=0.3) == [a]
    assert dedupe([S(10, 10, 99), S(5, 2, 99), a]) == [a]
    assert dedupe([]) == []

import pytest

from tests.conftest import scripted_words
from twapza.clipping.simple import Span, plan_simple_clips
from twapza.transcription import Word


def assert_valid_plan(spans: list[Span], duration: float):
    assert spans[0].start == 0
    assert spans[-1].end == pytest.approx(duration)
    for a, b in zip(spans, spans[1:]):
        assert a.end <= b.start, "clips must not overlap"
        assert b.start - a.end < 1.5, "only the pause between them may be skipped"
    assert all(s.duration > 0 for s in spans)


def test_no_transcript_cuts_exactly_at_target():
    spans = plan_simple_clips(300, [], 60)
    assert [(s.start, s.end) for s in spans] == [(0, 60), (60, 120), (120, 180), (180, 240), (240, 300)]


def test_cuts_snap_to_sentence_ends_within_window():
    duration = 600
    words = scripted_words(duration)
    sentence_ends = [w.end for w in words if w.text.endswith(".")]
    spans = plan_simple_clips(duration, words, 60, window=5)
    assert_valid_plan(spans, duration)
    for i, span in enumerate(spans[:-1]):
        # Each clip ends just after a sentence-final word...
        assert any(0 <= span.end - e <= 0.3 for e in sentence_ends), span
        # ...within ±5s of its target length.
        assert 55 <= span.duration <= 65


def test_short_tail_is_merged_into_last_clip():
    spans = plan_simple_clips(130, [], 60, min_len=15)
    # 0-60, then 70s remain (< 60 + 15): one final 70s clip
    assert [(s.start, s.end) for s in spans] == [(0, 60), (60, 130)]


def test_video_shorter_than_target_is_one_clip():
    assert plan_simple_clips(42.5, [], 60) == [Span(0, 42.5)]


def test_every_clip_except_whole_video_respects_min_length():
    words = scripted_words(400)
    for target in (15, 30, 45, 90, 180):
        spans = plan_simple_clips(400, words, target, min_len=15)
        assert_valid_plan(spans, 400)
        assert all(s.duration >= 15 for s in spans), target


def test_three_hour_video_is_fast_and_covers_everything():
    import time

    duration = 3 * 3600
    words = scripted_words(duration)  # ~25k words
    t0 = time.perf_counter()
    spans = plan_simple_clips(duration, words, 60)
    assert time.perf_counter() - t0 < 2
    assert_valid_plan(spans, duration)
    assert 170 <= len(spans) <= 185


def test_rejects_bad_input():
    assert plan_simple_clips(0, [], 60) == []
    with pytest.raises(ValueError):
        plan_simple_clips(100, [], 0)


def test_unsorted_words_are_handled():
    words = [Word(" b.", 61.0, 61.5), Word(" a", 10.0, 10.5), Word(" c", 62.5, 63.0)]
    spans = plan_simple_clips(200, words, 60)
    assert spans[0].end == pytest.approx(61.75)

import pytest

from twapza.clipping.snapping import (
    EDGE_PAD, Boundary, Cut, find_boundaries, score_boundary, snap_cut, word_strength,
)
from twapza.transcription import Word


def words_from(spec: list[tuple[str, float, float]]) -> list[Word]:
    return [Word(text=t, start=s, end=e) for t, s, e in spec]


@pytest.mark.parametrize("text,expected", [
    (" end.", 2), ("Really?", 2), ("wow!", 2), (' "quoted."', 2), ("(aside.)", 2), ("so…", 2),
    (" first,", 1), ("note:", 1), ("well;", 1),
    (" word", 0), ("", 0), ("e.g", 0), ("3.5", 0),
])
def test_word_strength(text, expected):
    assert word_strength(text) == expected


def test_find_boundaries_orders_words_and_collapses_overlaps():
    words = words_from([(" b.", 2.0, 2.5), (" a", 0.0, 1.0), (" c", 2.4, 3.0)])
    bs = find_boundaries(words)
    assert bs[0] == Boundary(gap_start=1.0, gap_end=2.0, strength=0)
    # " b." ends at 2.5 but " c" starts at 2.4: zero-length gap at the midpoint
    assert bs[1].gap_start == bs[1].gap_end == pytest.approx(2.45)
    assert bs[1].strength == 2


def test_score_prefers_sentence_end_over_slightly_longer_plain_pause():
    sentence = Boundary(10.0, 10.3, strength=2)
    plain = Boundary(10.0, 10.6, strength=0)
    assert score_boundary(sentence, 10.0, 5) > score_boundary(plain, 10.0, 5)


def test_score_penalises_distance():
    near = Boundary(10.0, 10.3, strength=2)
    far = Boundary(14.0, 14.3, strength=2)
    assert score_boundary(near, 10.0, 5) > score_boundary(far, 10.0, 5)


def test_snaps_to_sentence_end_instead_of_cutting_mid_sentence():
    # Target 60s falls in the middle of "the middle of" — the sentence ends at 62.0.
    words = words_from([
        (" this", 58.0, 58.4), (" is", 58.5, 58.8), (" the", 59.6, 59.9), (" middle", 60.0, 60.4),
        (" of", 60.5, 60.7), (" it.", 61.0, 62.0), (" Next", 62.8, 63.2), (" one", 63.3, 63.6),
    ])
    cut = snap_cut(60.0, find_boundaries(words))
    # Inside the 62.0–62.8 pause, padded away from the words.
    assert cut == Cut(end=62.0 + EDGE_PAD, start=62.8 - EDGE_PAD)


def test_cut_never_lands_inside_a_word():
    words = words_from([(f" w{i}", i * 0.5, i * 0.5 + 0.4) for i in range(200)])
    for target in (10.0, 23.37, 51.2, 70.05):
        cut = snap_cut(target, find_boundaries(words))
        for w in words:
            assert not (w.start < cut.end < w.end)
            assert not (w.start < cut.start < w.end)


@pytest.mark.parametrize("target", [30.0, 47.3, 61.0])
def test_cut_stays_within_window(target):
    # One strong sentence boundary far outside the window must be ignored.
    words = words_from([(" a", 0, 1), (" b.", 1.2, 2.0), (" c", 5.0, 5.5)] +
                       [(f" x{i}", 6 + i * 0.4, 6 + i * 0.4 + 0.35) for i in range(200)])
    cut = snap_cut(target, find_boundaries(words), window=5)
    assert target - 5 <= cut.end <= cut.start <= target + 5


def test_long_silence_containing_target_is_clamped_to_window():
    # Silence from 40s to 80s; target 60s. Cut must stay within ±5s and in the silence.
    words = words_from([(" before.", 39.0, 40.0), (" after", 80.0, 81.0)])
    cut = snap_cut(60.0, find_boundaries(words), window=5)
    assert 55.0 <= cut.end <= cut.start <= 65.0


def test_no_words_falls_back_to_target():
    assert snap_cut(42.0, []) == Cut(42.0, 42.0)


def test_respects_lo_hi_limits():
    words = words_from([(" a.", 50.0, 52.0), (" b", 53.0, 54.0), (" c", 58.0, 58.2)])
    bs = find_boundaries(words)
    # Without limits the strong sentence end at 52-53 wins.
    assert snap_cut(55.0, bs).end < 53
    # With lo=54 it's excluded: the 54-58 pause is used.
    cut = snap_cut(55.0, bs, lo=54.0)
    assert 54.0 <= cut.end <= cut.start <= 58.0


def test_conflicting_limits_do_not_crash():
    cut = snap_cut(10.0, [], lo=30.0, hi=20.0)
    assert cut.end == cut.start

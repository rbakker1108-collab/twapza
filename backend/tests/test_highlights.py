import threading
import time

import pytest

from twapza.clipping.highlights import ask_for_candidates, build_highlights, refine
from twapza.clipping.llm import Candidate, HighlightError, chunk_lines, Line
from twapza.clipping.snapping import find_boundaries
from twapza.transcription import Word


def sentence_words(duration=300.0):
    """8-word sentences: words 0.3s, gaps 0.1s, 0.8s pause after each sentence."""
    words, t, n = [], 0.0, 0
    while t + 0.3 < duration:
        n += 1
        end_of_sentence = n % 8 == 0
        words.append(Word(text=f" w{n}{'.' if end_of_sentence else ''}", start=round(t, 3),
                          end=round(t + 0.3, 3)))
        t += 0.3 + (0.8 if end_of_sentence else 0.1)
    return words


def cand(start, end, score=80.0, title="t"):
    return Candidate(start=start, end=end, title=title, hook="h", score=score, reason="r")


WORDS = sentence_words()
BOUNDARIES = find_boundaries(WORDS)
SENTENCE_ENDS = [w.end for w in WORDS if w.text.endswith(".")]
SENTENCE_STARTS = [WORDS[i + 1].start for i, w in enumerate(WORDS[:-1]) if w.text.endswith(".")]


def refine_kw(**over):
    return dict(words=WORDS, boundaries=BOUNDARIES, scene_cuts=[], energy=None, duration=300.0) | over


def test_refine_snaps_edges_to_sentence_boundaries():
    # The model said 20.0-50.0, which falls mid-sentence on both sides.
    out = refine(cand(20.0, 50.0), **refine_kw())
    assert any(0 < s - out.start <= 0.3 for s in SENTENCE_STARTS), out.start  # just before a sentence
    assert any(0 <= out.end - e <= 0.3 for e in SENTENCE_ENDS), out.end       # just after a sentence
    assert abs(out.start - 20.0) <= 2.5 and abs(out.end - 50.0) <= 2.5


def test_refine_aligns_start_to_nearby_scene_cut_outside_words():
    first = refine(cand(20.0, 50.0), **refine_kw())
    # a cut 0.4s before the snapped start, in the silence before the sentence
    gap_cut = first.start - 0.05
    out = refine(cand(20.0, 50.0), **refine_kw(scene_cuts=[5.0, gap_cut, 120.0]))
    assert out.start == pytest.approx(gap_cut)
    # a cut inside a word is ignored
    word = next(w for w in WORDS if w.start > first.start + 0.2)
    mid_word = (word.start + word.end) / 2
    assert refine(cand(20.0, 50.0), **refine_kw(scene_cuts=[mid_word])).start == first.start


def test_refine_keeps_original_edges_if_snapping_breaks_length_limits():
    out = refine(cand(20.0, 35.2), **refine_kw(min_len=15, max_len=90))
    assert (out.start, out.end) == (20.0, 35.2) or out.end - out.start >= 15


def test_refine_blends_energy_into_score():
    out = refine(cand(20, 50, score=80), **refine_kw(energy=lambda s, e: 30.0))
    assert out.score == pytest.approx(0.8 * 80 + 0.2 * 30)
    assert refine(cand(20, 50, score=80), **refine_kw()).score == 80


def test_build_highlights_refines_dedupes_and_ranks():
    cands = [
        cand(100, 140, 70, "a"), cand(101, 141, 90, "a-duplicate-better"),
        cand(200, 240, 80, "b"), cand(10, 40, 40, "c"),
    ]
    out = build_highlights(cands, words=WORDS, duration=300, limit=10)
    assert [c.title for c in out] == ["a-duplicate-better", "b", "c"]
    assert build_highlights(cands, words=WORDS, duration=300, limit=1)[0].title == "a-duplicate-better"
    assert build_highlights([], words=WORDS, duration=300) == []


# --- ask_for_candidates ------------------------------------------------------------------

def chunks(n):
    return chunk_lines([Line(t, t + 5, f"line {t}.") for t in range(0, n * 100, 10)],
                       chunk_seconds=100, overlap=0)


class FakeFinder:
    def __init__(self, delay=0.0, fail_on=None):
        self.delay, self.fail_on = delay, fail_on
        self.active = self.max_active = 0
        self.lock = threading.Lock()
        self.seen = []

    def find(self, chunk, *, video_title, video_duration, total_chunks):
        with self.lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            self.seen.append((chunk.index, video_title, total_chunks))
        try:
            time.sleep(self.delay)
            if chunk.index == self.fail_on:
                raise HighlightError("The Anthropic API key was rejected.")
            s = chunk.start + 10
            return f'{{"clips": [{{"start": {s}, "end": {s + 30}, "title": "c{chunk.index}", ' \
                   f'"hook": "h", "score": 70, "reason": "r"}}]}}'
        finally:
            with self.lock:
                self.active -= 1


def test_ask_for_candidates_runs_chunks_concurrently_with_progress():
    finder, progress = FakeFinder(delay=0.05), []
    out = ask_for_candidates(finder, chunks(6), video_title="v.mp4", video_duration=600,
                             concurrency=3, on_progress=progress.append)
    assert sorted(c.title for c in out) == [f"c{i}" for i in range(6)]
    assert finder.max_active == 3
    assert progress[-1] == 1.0 and len(progress) == 6
    assert {s[1:] for s in finder.seen} == {("v.mp4", 6)}


def test_ask_for_candidates_propagates_readable_errors():
    with pytest.raises(HighlightError, match="API key"):
        ask_for_candidates(FakeFinder(fail_on=1), chunks(3), video_title="v", video_duration=300,
                           concurrency=1)

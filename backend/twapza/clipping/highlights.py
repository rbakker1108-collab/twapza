"""Feature 2 pipeline: Claude suggestions → refined, scored, de-duplicated clips."""

import logging
from collections.abc import Callable, Sequence
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import replace

from twapza.clipping.dedupe import dedupe
from twapza.clipping.llm import Candidate, Chunk, HighlightFinder, parse_highlights
from twapza.clipping.signals import nearest
from twapza.clipping.snapping import find_boundaries, snap_cut
from twapza.transcription.base import Word

log = logging.getLogger(__name__)


def ask_for_candidates(
    finder: HighlightFinder,
    chunks: Sequence[Chunk],
    *,
    video_title: str,
    video_duration: float,
    min_len: float = 15,
    max_len: float = 90,
    concurrency: int = 4,
    on_progress: Callable[[float], None] | None = None,
) -> list[Candidate]:
    """Send every chunk to the model (a few at a time) and parse the answers."""
    results: list[Candidate] = []
    done = 0
    pool = ThreadPoolExecutor(max_workers=max(1, concurrency))
    futures = {
        pool.submit(finder.find, chunk, video_title=video_title,
                    video_duration=video_duration, total_chunks=len(chunks)): chunk
        for chunk in chunks
    }
    try:
        for future in as_completed(futures):
            chunk = futures[future]
            raw = future.result()  # HighlightError propagates to the job
            parsed = parse_highlights(raw, chunk_start=chunk.start, chunk_end=chunk.end,
                                      min_len=min_len, max_len=max_len)
            log.info("chunk %s: %d candidate(s)", chunk.index, len(parsed))
            results.extend(parsed)
            done += 1
            if on_progress:
                on_progress(done / len(chunks))  # raises JobCanceled if the user canceled
    except BaseException:
        # Error or cancel: don't start the remaining chunks, and don't wait for those in flight.
        pool.shutdown(wait=False, cancel_futures=True)
        raise
    pool.shutdown(wait=True)
    return results


def _inside_word(t: float, words: Sequence[Word]) -> bool:
    return any(w.start < t < w.end for w in words)


def refine(
    cand: Candidate,
    *,
    words: Sequence[Word],
    boundaries,
    scene_cuts: Sequence[float],
    energy: Callable[[float, float], float] | None,
    duration: float,
    min_len: float = 15,
    max_len: float = 90,
    snap_window: float = 2.5,
    scene_window: float = 1.0,
    llm_weight: float = 0.8,
) -> Candidate:
    """Tidy one candidate's edges and blend in the loudness signal.

    1. Snap start/end to the nearest pause / sentence boundary (±``snap_window`` s).
    2. If a scene cut is within ``scene_window`` s of the start and doesn't fall
       inside a word, start exactly on the cut (cleaner first frame).
    3. Keep the original edges if refinement would break the length limits.
    4. score = ``llm_weight`` × model score + (1 − ``llm_weight``) × energy score.
    """
    start = snap_cut(cand.start, boundaries, window=snap_window, lo=0, hi=duration).start
    end = snap_cut(cand.end, boundaries, window=snap_window, lo=0, hi=duration).end

    cut = nearest(scene_cuts, start)
    if cut is not None and abs(cut - start) <= scene_window and not _inside_word(cut, words):
        start = cut

    if not (min_len <= end - start <= max_len):
        start, end = cand.start, cand.end
    start, end = max(0.0, start), min(duration, end)

    score = cand.score
    if energy is not None:
        score = llm_weight * cand.score + (1 - llm_weight) * energy(start, end)
    return replace(cand, start=round(start, 3), end=round(end, 3), score=round(score, 1))


def build_highlights(
    candidates: Sequence[Candidate],
    *,
    words: Sequence[Word],
    scene_cuts: Sequence[float] = (),
    energy: Callable[[float, float], float] | None = None,
    duration: float,
    min_len: float = 15,
    max_len: float = 90,
    limit: int | None = 30,
) -> list[Candidate]:
    """Refine every candidate, then drop overlapping duplicates. Returned best-first."""
    boundaries = find_boundaries(words)
    cuts = sorted(scene_cuts)
    refined = [
        refine(c, words=words, boundaries=boundaries, scene_cuts=cuts, energy=energy,
               duration=duration, min_len=min_len, max_len=max_len)
        for c in candidates
    ]
    return dedupe(refined, limit=limit)

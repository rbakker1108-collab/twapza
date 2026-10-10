"""SubRip (.srt) subtitle files for a clip, for uploading alongside it on YouTube / TikTok."""

from collections.abc import Sequence

from twapza.captions.ass import HOLD, clip_words, group_words
from twapza.transcription.base import Word


def srt_time(seconds: float) -> str:
    ms = max(0, round(seconds * 1000))
    h, rem = divmod(ms, 3_600_000)
    m, rem = divmod(rem, 60_000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(words: Sequence[Word], *, clip_start: float, clip_end: float,
              max_words: int = 7) -> str | None:
    """Subtitle cues of up to ``max_words`` (broken at sentence ends/pauses), times relative to the clip."""
    pages = group_words(clip_words(words, clip_start, clip_end), max_words)
    if not pages:
        return None
    length = clip_end - clip_start
    cues = []
    for i, page in enumerate(pages):
        next_start = pages[i + 1][0].start if i + 1 < len(pages) else length
        end = min(max(page[-1].end, min(page[-1].end + HOLD, next_start)), length)
        text = " ".join(w.text for w in page)
        cues.append(f"{i + 1}\n{srt_time(page[0].start)} --> {srt_time(end)}\n{text}\n")
    return "\n".join(cues)

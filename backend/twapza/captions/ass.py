"""Generate ASS subtitles with word-by-word highlighting for a clip.

Pure functions: transcript words + clip range + style → ASS text. The video is
burned with ffmpeg's ``ass`` filter (``media/ffmpeg.py``).

Captions are shown a few words at a time ("pages"). While a page is on screen,
one event per word re-draws the page with the word being spoken in the
highlight colour, which gives the popular karaoke-style "active word" look.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from twapza.captions.style import FONTS, CaptionSettings
from twapza.clipping.snapping import word_strength
from twapza.transcription.base import Word

PAGE_GAP = 0.6   # a pause longer than this (s) starts a new page
HOLD = 0.4       # keep the last page up this long after its last word (s)
SIZE_FACTOR = {"small": 0.06, "medium": 0.075, "large": 0.095}  # × short side of the frame


@dataclass(frozen=True)
class TimedWord:
    text: str
    start: float
    end: float


@dataclass(frozen=True)
class Event:
    start: float
    end: float
    text: str


def ass_color(hex_color: str) -> str:
    """'#RRGGBB' → ASS '&H00BBGGRR' (ASS stores colours as alpha-blue-green-red)."""
    h = hex_color.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


def ass_time(seconds: float) -> str:
    """Seconds → ASS 'H:MM:SS.cc' (centiseconds)."""
    cs = max(0, round(seconds * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def escape_text(text: str) -> str:
    """Neutralise ASS override syntax in transcript text."""
    return " ".join(text.replace("\\", "/").replace("{", "(").replace("}", ")").split())


def clip_words(words: Sequence[Word], start: float, end: float) -> list[TimedWord]:
    """Words spoken inside [start, end], with times relative to the clip start."""
    out = []
    for w in sorted(words, key=lambda w: w.start):
        text = escape_text(w.text)
        if not text or w.end <= start or w.start >= end:
            continue
        out.append(TimedWord(text=text, start=round(max(0.0, w.start - start), 3),
                             end=round(min(end, w.end) - start, 3)))
    return out


def group_words(words: Sequence[TimedWord], max_words: int) -> list[list[TimedWord]]:
    """Split words into caption pages: at most ``max_words``, breaking at sentence ends and pauses."""
    pages: list[list[TimedWord]] = []
    current: list[TimedWord] = []
    for i, word in enumerate(words):
        current.append(word)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if (nxt is None or len(current) >= max_words or word_strength(word.text) == 2
                or nxt.start - word.end > PAGE_GAP):
            pages.append(current)
            current = []
    return pages


def caption_events(words: Sequence[TimedWord], settings: CaptionSettings, clip_length: float) -> list[Event]:
    """One event per spoken word, showing its page with that word highlighted."""
    highlight, text_color = ass_color(settings.highlight_color), ass_color(settings.text_color)
    pages = group_words(words, settings.words_per_line)
    events: list[Event] = []
    for p, page in enumerate(pages):
        next_start = pages[p + 1][0].start if p + 1 < len(pages) else clip_length
        # Hold the page briefly after its last word, but never into the next page.
        last = page[-1].end
        page_end = min(max(last, min(last + HOLD, next_start)), clip_length)
        tokens = [w.text.upper() if settings.uppercase else w.text for w in page]
        for i, word in enumerate(page):
            start = word.start
            end = page[i + 1].start if i + 1 < len(page) else page_end
            if end - start < 0.01:
                continue
            parts = [
                f"{{\\1c{highlight}&}}{tok}{{\\1c{text_color}&}}" if j == i else tok
                for j, tok in enumerate(tokens)
            ]
            events.append(Event(start=start, end=end, text=" ".join(parts)))
    return events


def build_ass(
    words: Sequence[Word],
    *,
    clip_start: float,
    clip_end: float,
    settings: CaptionSettings,
    width: int,
    height: int,
) -> str | None:
    """Complete ASS document for one clip at ``width``×``height``, or None if nothing is said."""
    events = caption_events(clip_words(words, clip_start, clip_end), settings, clip_end - clip_start)
    if not events:
        return None

    family, multiplier = FONTS[settings.font]
    short = min(width, height)
    vertical = height > width
    size = round(short * SIZE_FACTOR[settings.size] * multiplier)
    outline = max(2, round(short * 0.006))
    margin_lr = round(width * 0.06)
    alignment, margin_v = {
        # bottom sits above the TikTok/Shorts caption & button area on vertical video
        "bottom": (2, round(height * (0.2 if vertical else 0.08))),
        "middle": (5, 0),
        "top": (8, round(height * (0.12 if vertical else 0.06))),
    }[settings.position]

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,{family},{size},{ass_color(settings.text_color)},{ass_color(settings.text_color)},{ass_color(settings.outline_color)},&H80000000,0,0,0,0,100,100,0,0,1,{outline},{max(1, outline // 2)},{alignment},{margin_lr},{margin_lr},{margin_v},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [f"Dialogue: 0,{ass_time(e.start)},{ass_time(e.end)},Caption,,0,0,0,,{e.text}" for e in events]
    return header + "\n".join(lines) + "\n"

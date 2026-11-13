"""Generate ASS subtitles with word-by-word highlighting for a clip.

Pure functions: transcript words + clip range + style → ASS text. The video is
burned with ffmpeg's ``ass`` filter (``media/ffmpeg.py``).

Captions are shown a few words at a time ("pages"). While a page is on screen,
one event per word re-draws the page with the word being spoken in the
highlight colour, which gives the popular karaoke-style "active word" look.
"""

from collections.abc import Sequence
from dataclasses import dataclass

from twapza.captions.style import ARABIC_FONT, EM_PER_ASS_SIZE, FONTS, CaptionSettings, has_arabic
from twapza.clipping.snapping import word_strength
from twapza.clipping.timeline import Segment, TimedWord, map_span, map_words, total_length
from twapza.transcription.base import Word

PAGE_GAP = 0.6   # a pause longer than this (s) starts a new page
HOLD = 0.4       # keep the last page up this long after its last word (s)
SIZE_FACTOR = {"small": 0.06, "medium": 0.075, "large": 0.095}  # × short side of the frame


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


HOOK_SECONDS = 3.0   # the hook text shows for the first few seconds
HOOK_SIZE = 0.082    # × short side of the frame
HOOK_MAX_CHARS = 70
PROGRESS_HEIGHT = 0.009  # × frame height


@dataclass(frozen=True)
class TextBox:
    """A text the user placed on the video (clip editor), in source time.

    ``x``/``y``: centre of the text as fractions of the frame; ``size``: font em as a
    fraction of the frame width (what the browser editor shows); ``style``: "outline",
    "box" (opaque box behind the text) or "plain" (soft shadow only).
    """
    text: str
    x: float
    y: float
    size: float
    font: str
    color: str
    style: str
    start: float
    end: float


def rebase_words(words: Sequence[Word], clip_start: float | None, clip_end: float | None,
            segments: Sequence[Segment] | None) -> tuple[list[TimedWord], float]:
    """Words on the output timeline (escaped for ASS) and the clip's output length."""
    if segments is None:
        if clip_start is None or clip_end is None:
            raise ValueError("give clip_start/clip_end or segments")
        segments = [Segment(clip_start, clip_end)]
    mapped = [TimedWord(escape_text(w.text), w.start, w.end) for w in map_words(words, segments)]
    return [w for w in mapped if w.text], total_length(segments)


def hook_event(text: str, length: float, *, full: bool = False) -> Event | None:
    """The hook title: faded in and out over the first ``HOOK_SECONDS``, or the whole clip (``full``)."""
    text = escape_text(text)
    if not text:
        return None
    if len(text) > HOOK_MAX_CHARS:
        text = text[: HOOK_MAX_CHARS - 1].rsplit(" ", 1)[0] + "…"
    if full:
        return Event(start=0.0, end=length, text=f"{{\\fad(120,0)}}{text}") if length > 0.3 else None
    end = min(HOOK_SECONDS, length)
    return Event(start=0.0, end=end, text=f"{{\\fad(120,250)}}{text}") if end > 0.3 else None


def box_text(text: str) -> str:
    """User text for ASS: override syntax neutralised, line breaks kept."""
    lines = [escape_text(line) for line in text.splitlines()]
    return "\\N".join(line for line in lines if line)


def font_for(font: str, text: str) -> tuple[str, float]:
    """(ASS family, size factor) for ``font`` showing ``text``.

    Arabic text switches to the bundled Arabic font, scaled so its em matches ``font``'s
    (the browser previews fall back to the same font at the same em).
    """
    family = FONTS.get(font, FONTS["montserrat"])[0]
    if not has_arabic(text):
        return family, 1.0
    return ARABIC_FONT[0], EM_PER_ASS_SIZE.get(font, 0.643) / ARABIC_FONT[1]


def box_size(box: TextBox, width: int) -> int:
    """ASS Fontsize that renders the em the browser editor showed."""
    return max(8, round(box.size * width / EM_PER_ASS_SIZE.get(box.font, 0.643)))


def progress_events(length: float, width: int, height: int) -> list[str]:
    """A thin bar along the top that fills up over the clip (drawn, so it follows any edit)."""
    if length <= 0.3:
        return []
    bar = max(6, round(height * PROGRESS_HEIGHT))
    shape = f"m 0 0 l {width} 0 l {width} {bar} l 0 {bar}"
    end, ms = ass_time(length), round(length * 1000)
    return [
        f"Dialogue: 3,0:00:00.00,{end},Track,,0,0,0,,{{\\an7\\pos(0,0)\\p1}}{shape}{{\\p0}}",
        f"Dialogue: 4,0:00:00.00,{end},Progress,,0,0,0,,"
        f"{{\\an7\\pos(0,0)\\fscx0\\t(0,{ms},\\fscx100)\\p1}}{shape}{{\\p0}}",
    ]


def build_ass(
    words: Sequence[Word],
    *,
    clip_start: float | None = None,
    clip_end: float | None = None,
    segments: Sequence[Segment] | None = None,
    settings: CaptionSettings | None,
    width: int,
    height: int,
    hook: str | None = None,
    hook_full: bool = False,
    boxes: Sequence[TextBox] = (),
    progress_color: str | None = None,
) -> str | None:
    """ASS document for one clip at ``width``×``height``, or None if there is nothing to show.

    ``settings`` adds word-by-word captions; ``hook`` adds the hook title at the top
    for the first seconds. The clip is ``[clip_start, clip_end]`` or, for an edited
    clip (cut pauses / cold open), the ``segments`` played in order.
    """
    if segments is None and clip_start is not None and clip_end is not None:
        segments = [Segment(clip_start, clip_end)]
    timed, length = rebase_words(words, clip_start, clip_end, segments)
    events = caption_events(timed, settings, length) if settings else []
    hook_ev = hook_event(hook, length, full=hook_full) if hook else None
    placed = [(i, box, span) for i, box in enumerate(boxes) if box_text(box.text)
              for span in map_span(box.start, box.end, segments or [])]
    if not events and hook_ev is None and not placed and not progress_color:
        return None

    short = min(width, height)
    vertical = height > width
    outline = max(2, round(short * 0.006))
    margin_lr = round(width * 0.06)
    styles = []
    # Encoding -1 (libass extension) = detect the base direction, so Arabic reads right to left.
    if settings:
        multiplier = FONTS[settings.font][1]
        family, scale = font_for(settings.font, " ".join(w.text for w in timed))
        size = round(short * SIZE_FACTOR[settings.size] * multiplier * scale)
        alignment, margin_v = {
            # bottom sits above the TikTok/Shorts caption & button area on vertical video
            "bottom": (2, round(height * (0.2 if vertical else 0.08))),
            "middle": (5, 0),
            "top": (8, round(height * (0.12 if vertical else 0.06))),
        }[settings.position]
        styles.append(
            f"Style: Caption,{family},{size},{ass_color(settings.text_color)},{ass_color(settings.text_color)},"
            f"{ass_color(settings.outline_color)},&H80000000,0,0,0,0,100,100,0,0,1,{outline},"
            f"{max(1, outline // 2)},{alignment},{margin_lr},{margin_lr},{margin_v},-1")
    if hook_ev:
        font = settings.font if settings else "montserrat"
        family, scale = font_for(font, hook or "")
        size = round(short * HOOK_SIZE * FONTS[font][1] * scale)
        # Top third, clear of the platform UI; centre when the captions already use the top.
        top = not (settings and settings.position == "top")
        alignment, margin_v = (8, round(height * (0.14 if vertical else 0.07))) if top else (5, 0)
        box = max(4, round(size * 0.28))
        # BorderStyle 3 = opaque box behind the text (drawn in the outline colour).
        styles.append(
            f"Style: Hook,{family},{size},&H00FFFFFF,&H00FFFFFF,&H33000000,&H33000000,0,0,0,0,"
            f"100,100,0,0,3,{box},0,{alignment},{round(width * 0.09)},{round(width * 0.09)},{margin_v},-1")

    for i, box in enumerate(boxes):
        family, scale = font_for(box.font, box.text)
        size = round(box_size(box, width) * scale)
        color = ass_color(box.color)
        if box.style == "box":  # opaque dark box behind the text (BorderStyle 3)
            border = (3, max(4, round(size * 0.22)), 0, "&H33000000")
        elif box.style == "plain":
            border = (1, 0, max(2, round(size * 0.05)), "&H00000000")
        else:  # outline
            border = (1, max(2, round(size * 0.07)), max(1, round(size * 0.03)), "&H00000000")
        kind, outline, shadow, outline_color = border
        styles.append(
            f"Style: Box{i},{family},{size},{color},{color},{outline_color},&H80000000,0,0,0,0,"
            f"100,100,0,0,{kind},{outline},{shadow},5,0,0,0,-1")
    if progress_color:
        color = ass_color(progress_color)
        styles.append("Style: Track,Arial,20,&H99000000,&H99000000,&H00000000,&H00000000,0,0,0,0,"
                      "100,100,0,0,1,0,0,7,0,0,0,1")
        styles.append(f"Style: Progress,Arial,20,{color},{color},&H00000000,&H00000000,0,0,0,0,"
                      "100,100,0,0,1,0,0,7,0,0,0,1")

    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{chr(10).join(styles)}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    lines = [f"Dialogue: 0,{ass_time(e.start)},{ass_time(e.end)},Caption,,0,0,0,,{e.text}" for e in events]
    if hook_ev:
        lines.append(f"Dialogue: 1,{ass_time(hook_ev.start)},{ass_time(hook_ev.end)},Hook,,0,0,0,,{hook_ev.text}")
    for i, box, (s, e) in placed:
        x, y = round(box.x * width), round(box.y * height)
        lines.append(f"Dialogue: 2,{ass_time(s)},{ass_time(e)},Box{i},,0,0,0,,"
                     f"{{\\an5\\pos({x},{y})}}{box_text(box.text)}")
    if progress_color:
        lines += progress_events(length, width, height)
    return header + "\n".join(lines) + "\n"

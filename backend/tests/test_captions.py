import re
import subprocess

import pytest

from tests.conftest import make_test_video, requires_ffmpeg
from twapza.captions.ass import (
    TimedWord, ass_color, ass_time, build_ass, caption_events, clip_words, escape_text, group_words,
)
from twapza.captions.style import FONTS, FONTS_DIR, CaptionSettings
from twapza.media import ffmpeg
from twapza.transcription import Word


def W(text, start, end):
    return Word(text=text, start=start, end=end)


def T(text, start, end):
    return TimedWord(text=text, start=start, end=end)


# --- small helpers ------------------------------------------------------------------

@pytest.mark.parametrize("hex_color,expected", [
    ("#FFFFFF", "&H00FFFFFF"), ("#FF0000", "&H000000FF"), ("#00ff00", "&H0000FF00"),
    ("#123456", "&H00563412"),
])
def test_ass_color_is_bgr(hex_color, expected):
    assert ass_color(hex_color) == expected


@pytest.mark.parametrize("seconds,expected", [
    (0, "0:00:00.00"), (1.234, "0:00:01.23"), (61.999, "0:01:02.00"), (3725.5, "1:02:05.50"), (-1, "0:00:00.00"),
])
def test_ass_time(seconds, expected):
    assert ass_time(seconds) == expected


def test_escape_text_neutralises_override_tags():
    assert escape_text(r" {\b1}hack\N ") == "(/b1)hack/N"
    assert escape_text("  two\n words ") == "two words"


def test_clip_words_rebases_and_clips_to_range():
    words = [W(" before", 1, 2), W(" edge", 9.5, 10.4), W(" in", 11, 11.5), W(" late", 19.8, 20.6),
             W(" after", 21, 22), W(" ", 12, 12.1)]
    got = clip_words(words, 10, 20)
    assert got == [T("edge", 0.0, 0.4), T("in", 1.0, 1.5), T("late", 9.8, 10.0)]


# --- grouping & events -----------------------------------------------------------------

def test_group_words_by_count_sentence_and_pause():
    words = [T("one", 0, .3), T("two", .4, .7), T("three", .8, 1.1), T("four.", 1.2, 1.5),
             T("Five", 1.6, 1.9), T("six", 3.0, 3.3)]  # 1.1s pause before "six"
    pages = group_words(words, max_words=3)
    assert [[w.text for w in p] for p in pages] == [["one", "two", "three"], ["four."], ["Five"], ["six"]]
    assert group_words([], 3) == []


def test_events_highlight_one_word_at_a_time():
    s = CaptionSettings(words_per_line=3, uppercase=True, highlight_color="#FF0000", text_color="#FFFFFF")
    words = [T("hello", 0.5, 0.9), T("big", 1.0, 1.3), T("world", 1.4, 2.0)]
    events = caption_events(words, s, clip_length=10)
    assert [(e.start, e.end) for e in events] == [(0.5, 1.0), (1.0, 1.4), (1.4, 2.4)]  # +0.4s hold
    hl, white = "{\\1c&H000000FF&}", "{\\1c&H00FFFFFF&}"
    assert events[0].text == f"{hl}HELLO{white} BIG WORLD"
    assert events[1].text == f"HELLO {hl}BIG{white} WORLD"
    assert events[2].text == f"HELLO BIG {hl}WORLD{white}"


def test_events_do_not_overlap_and_hold_stops_at_next_page():
    s = CaptionSettings(words_per_line=2, uppercase=False)
    words = [T("a", 0, .2), T("b", .3, .5), T("c", .6, .8), T("d", .9, 1.0)]
    events = caption_events(words, s, clip_length=1.2)
    for a, b in zip(events, events[1:]):
        assert a.end <= b.start + 1e-9
    assert events[1].end == pytest.approx(0.6)   # page 1 ends when page 2 starts
    assert events[-1].end == pytest.approx(1.2)  # hold clipped to clip length
    assert "a" in events[0].text and "A" not in events[0].text


def test_build_ass_document():
    words = [W(" Hello", 10.5, 10.9), W(" world.", 11.0, 11.6)]
    doc = build_ass(words, clip_start=10, clip_end=20,
                    settings=CaptionSettings(font="anton", size="large", position="top"),
                    width=1080, height=1920)
    assert "PlayResX: 1080\nPlayResY: 1920" in doc
    style = next(line for line in doc.splitlines() if line.startswith("Style: Caption,"))
    fields = style.removeprefix("Style: ").split(",")
    assert fields[1] == "Anton"
    assert int(fields[2]) == round(1080 * 0.095 * FONTS["anton"][1])
    assert fields[18] == "8"  # top-centre alignment
    dialogues = [line for line in doc.splitlines() if line.startswith("Dialogue:")]
    assert len(dialogues) == 2
    assert dialogues[0].startswith("Dialogue: 0,0:00:00.50,0:00:01.00,Caption,,0,0,0,,")


@pytest.mark.parametrize("position,alignment", [("bottom", "2"), ("middle", "5"), ("top", "8")])
def test_positions(position, alignment):
    doc = build_ass([W("hi", 0, 1)], clip_start=0, clip_end=5,
                    settings=CaptionSettings(position=position), width=1920, height=1080)
    style = next(line for line in doc.splitlines() if line.startswith("Style:")).split(",")
    assert style[18] == alignment


def test_no_speech_means_no_captions():
    assert build_ass([], clip_start=0, clip_end=10, settings=CaptionSettings(), width=1080, height=1920) is None
    assert build_ass([W("x", 50, 51)], clip_start=0, clip_end=10, settings=CaptionSettings(),
                     width=1080, height=1920) is None


@pytest.mark.parametrize("bad", [{"text_color": "red"}, {"highlight_color": "#12345"},
                                 {"font": "comic-sans"}, {"words_per_line": 0}, {"size": "huge"}])
def test_settings_validation(bad):
    with pytest.raises(ValueError):
        CaptionSettings(**bad)


def test_bundled_fonts_exist_with_licences():
    files = {p.name for p in FONTS_DIR.iterdir()}
    for name in ("Montserrat-ExtraBold.ttf", "Poppins-ExtraBold.ttf", "Anton-Regular.ttf",
                 "BebasNeue-Regular.ttf"):
        assert name in files
    assert len([f for f in files if f.startswith("OFL-")]) == 4


# --- rendering with ffmpeg/libass ---------------------------------------------------------

def _frame(path, at, w, h):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(at), "-i", str(path), "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], check=True, capture_output=True).stdout
    assert len(raw) == w * h * 3
    return raw


def _count(raw, w, rows, pred):
    n = 0
    for y in rows:
        row = raw[y * w * 3:(y + 1) * w * 3]
        n += sum(1 for x in range(0, w * 3, 3) if pred(row[x], row[x + 1], row[x + 2]))
    return n


@requires_ffmpeg
def test_burned_captions_show_highlighted_word(tmp_path):
    w, h = 360, 640
    src = tmp_path / "black.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=black:size={w}x{h}:d=3:r=25",
                    "-pix_fmt", "yuv420p", "-c:v", "libx264", "-preset", "ultrafast", str(src)], check=True)
    words = [W(" HELLO", 0.2, 1.4), W(" THERE", 1.5, 2.8)]
    settings = CaptionSettings(highlight_color="#00FF00", text_color="#FFFFFF", position="bottom")
    ass = tmp_path / "c.ass"
    ass.write_text(build_ass(words, clip_start=0, clip_end=3, settings=settings, width=w, height=h))
    out = tmp_path / "captioned.mp4"
    ffmpeg.cut_clip(src, out, 0, 3, preset="ultrafast", video_filter=ffmpeg.ass_filter(ass, FONTS_DIR))

    green = lambda r, g, b: g > 180 and r < 100 and b < 100  # noqa: E731
    white = lambda r, g, b: r > 200 and g > 200 and b > 200  # noqa: E731
    bottom = range(int(h * 0.55), int(h * 0.85))
    top = range(0, int(h * 0.4))
    frame = _frame(out, 0.8, w, h)  # "HELLO" active
    assert _count(frame, w, bottom, green) > 150
    assert _count(frame, w, bottom, white) > 150   # "THERE" in normal colour
    assert _count(frame, w, top, green) == 0       # captions sit at the bottom
    assert _count(_frame(out, 0.05, w, h), w, bottom, green) == 0  # nothing before speech


def test_ass_filter_rejects_unsafe_paths(tmp_path):
    with pytest.raises(ffmpeg.MediaError):
        ffmpeg.ass_filter(tmp_path / "it's.ass", FONTS_DIR)
    assert ffmpeg.ass_filter(tmp_path / "with space.ass", FONTS_DIR).startswith("ass=filename='")
    assert ffmpeg.join_filters(None, "a", "", "b") == "a,b" and ffmpeg.join_filters(None) is None


@requires_ffmpeg
def test_probe_reports_rotation(tmp_path):
    src = make_test_video(tmp_path / "l.mp4", seconds=1, size="640x360")
    rotated = tmp_path / "r.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-display_rotation", "90", "-i", str(src),
                    "-c", "copy", str(rotated)], check=True)
    info = ffmpeg.probe(rotated)
    assert info.rotation in (90, 270) and info.display_size == (360, 640)
    assert ffmpeg.probe(src).display_size == (640, 360)
    assert re.match(r"\d", str(info.rotation))


def test_srt_cues():
    from twapza.captions.srt import build_srt, srt_time

    assert srt_time(3725.5) == "01:02:05,500" and srt_time(-1) == "00:00:00,000"
    words = [W(" Hello", 10.5, 10.9), W(" world.", 11.0, 11.6), W(" Next", 12.0, 12.3),
             W(" one", 12.4, 12.8), W(" outside", 30, 31)]
    srt = build_srt(words, clip_start=10, clip_end=20)
    assert srt == (
        "1\n00:00:00,500 --> 00:00:02,000\nHello world.\n\n"
        "2\n00:00:02,000 --> 00:00:03,200\nNext one\n"
    )
    assert build_srt([], clip_start=0, clip_end=10) is None

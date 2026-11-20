"""Clip editor texts, caption fixes, filler-word removal, progress bar, full-length hook, AI focus."""

import json
import subprocess

import pytest

from tests.conftest import make_test_video, requires_ffmpeg, upload_file
from twapza.captions.ass import TextBox, box_size, box_text, build_ass, hook_event, progress_events
from twapza.captions.style import EM_PER_ASS_SIZE, FONTS, FONTS_DIR
from twapza.clipping.timeline import Segment, is_filler, map_span, remove_pauses
from twapza.transcription import Word


def W(text, start, end):
    return Word(text=text, start=start, end=end)


# --- pure ------------------------------------------------------------------------------

def test_map_span_follows_the_edit():
    segs = [Segment(40, 44), Segment(10, 20), Segment(25, 30)]          # teaser, then the clip in parts
    assert map_span(10, 30, segs) == [(4.0, 19.0)]                      # contiguous parts merge
    assert map_span(41, 43, segs) == [(1.0, 3.0), ]                     # only inside the teaser …
    assert map_span(12, 26, segs) == [(6.0, 15.0)]
    assert map_span(20, 25, segs) == []                                 # cut out entirely
    assert map_span(39, 45, segs) == [(0.0, 4.0)]


def test_fillers():
    assert is_filler(W(" Um,", 0, 1)) and is_filler(W(" ehm", 0, 1)) and not is_filler(W(" umbrella", 0, 1))
    words = [W(" So", 0.0, 0.3), W(" um", 0.5, 0.8), W(" yes.", 1.0, 1.3), W(" Uh", 1.4, 1.6), W(" no", 1.7, 2.0)]
    # Fillers only: the um/uh and the silence around them go, short gaps elsewhere stay.
    assert remove_pauses(words, 0, 2.0, pauses=False, fillers=True) == [
        Segment(0.0, 0.4), Segment(0.9, 1.4), Segment(1.6, 2.0)]
    # Neither option → unchanged.
    assert remove_pauses(words, 0, 2.0, pauses=False, fillers=False) == [Segment(0, 2.0)]
    # A filler right at the start is trimmed too.
    assert remove_pauses([W("Uh", 0.0, 0.4), W("hi", 0.6, 1.0)], 0, 1.0, pauses=False, fillers=True)[0].start == 0.5


def test_full_length_hook_and_progress_bar():
    assert (hook_event("Hi", 20, full=True).end) == 20
    assert "\\fad(120,0)" in hook_event("Hi", 20, full=True).text
    track, bar = progress_events(10, 1080, 1920)
    assert track.startswith("Dialogue: 3,0:00:00.00,0:00:10.00,Track") and "m 0 0 l 1080 0 l 1080 17" in track
    assert "\\fscx0\\t(0,10000,\\fscx100)" in bar
    assert progress_events(0.1, 1080, 1920) == []


def test_text_boxes_in_the_ass_document():
    box = TextBox("Day 3\nin the {jungle}", x=0.5, y=0.25, size=0.08, font="anton", color="#FF0000",
                  style="box", start=12, end=15)
    assert box_text(box.text) == "Day 3\\Nin the (jungle)"
    assert box_size(box, 1080) == round(0.08 * 1080 / EM_PER_ASS_SIZE["anton"])
    doc = build_ass([], segments=[Segment(10, 20)], settings=None, width=1080, height=1920, boxes=[box])
    style = next(line for line in doc.splitlines() if line.startswith("Style: Box0,")).split(",")
    assert style[1] == FONTS["anton"][0] and style[3] == "&H000000FF" and style[15] == "3"
    events = [line for line in doc.splitlines() if line.startswith("Dialogue")]
    assert events == ["Dialogue: 2,0:00:02.00,0:00:05.00,Box0,,0,0,0,,{\\an5\\pos(540,480)}Day 3\\Nin the (jungle)"]
    # Outside the edited clip → nothing to show.
    assert build_ass([], segments=[Segment(0, 5)], settings=None, width=1080, height=1920, boxes=[box]) is None
    # Empty text is skipped.
    empty = TextBox("  ", 0.5, 0.5, 0.05, "montserrat", "#FFFFFF", "outline", 0, 5)
    assert build_ass([], segments=[Segment(0, 5)], settings=None, width=1080, height=1920, boxes=[empty]) is None


@requires_ffmpeg
@pytest.mark.parametrize("font,file,cap", [
    ("montserrat", "Montserrat-ExtraBold.ttf", 0.700), ("poppins", "Poppins-ExtraBold.ttf", 0.709),
    ("anton", "Anton-Regular.ttf", 0.859), ("bebas", "BebasNeue-Regular.ttf", 0.700),
])
def test_text_renders_at_the_size_the_editor_shows(tmp_path, font, file, cap):
    """A box of size 0.1 (em = 10% of the width, as in the browser) has the expected cap height."""
    box = TextBox("H", 0.5, 0.5, 0.1, font, "#FFFFFF", "plain", 0, 1)
    doc = build_ass([], clip_start=0, clip_end=1, settings=None, width=1080, height=1920, boxes=[box])
    (tmp_path / "t.ass").write_text(doc)
    from twapza.media import ffmpeg
    raw = subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=black:s=1080x1920:d=1:r=1",
                          "-vf", f"{ffmpeg.ass_filter(tmp_path / 't.ass', FONTS_DIR)},format=gray",
                          "-frames:v", "1", "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    rows = [y for y in range(1920) if max(raw[y * 1080:(y + 1) * 1080]) > 128]
    expected = 0.1 * 1080 * cap  # em in px × the font's cap-height ratio
    assert rows and (rows[-1] - rows[0] + 1) == pytest.approx(expected, rel=0.08)


def test_ai_focus_prompt():
    from twapza.clipping.llm import system_prompt

    p = system_prompt(5, focus="  funny <moments>  ")
    assert "<request>funny (moments)</request>" in p and "empty list" in p
    assert "<request>" not in system_prompt(5) and "<request>" not in system_prompt(5, focus="  ")


# --- API -------------------------------------------------------------------------------

@pytest.fixture
def clip(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TWAPZA_EXPORT_PRESET", "ultrafast")
    from twapza.config import get_settings
    get_settings.cache_clear()
    pid = upload_file(client, make_test_video(tmp_path / "talk.mp4", seconds=20))["project"]["id"]
    assert client.post(f"/api/projects/{pid}/simple-clips", json={"target_seconds": 15}).status_code == 202
    return client.get(f"/api/projects/{pid}/clips").json()[0]


TEXT = {"id": "t1", "text": "Day 3", "x": 0.5, "y": 0.3, "size": 0.08, "font": "anton",
        "color": "#FFD400", "style": "box", "start": 1, "end": 4}


@requires_ffmpeg
def test_overlays_are_saved_validated_and_rendered(client, clip):
    r = client.put(f"/api/clips/{clip['id']}/overlays", json={"overlays": [TEXT, {**TEXT, "id": "t2", "end": None}]})
    assert r.status_code == 200, r.text
    assert [o["id"] for o in r.json()["overlays"]] == ["t1", "t2"] and r.json()["overlays"][1]["end"] is None
    listed = client.get(f"/api/projects/{clip['project_id']}/clips").json()[0]
    assert listed["overlays"][0]["text"] == "Day 3"

    for bad in [{**TEXT, "end": 1}, {**TEXT, "color": "red"}, {**TEXT, "x": 1.5}, {**TEXT, "font": "comic"}]:
        assert client.put(f"/api/clips/{clip['id']}/overlays", json={"overlays": [bad]}).status_code == 422

    settings = {"aspect": "9:16", "progress_bar": True, "cut_fillers": True, "hook_text": True, "hook_full": True}
    job = client.post(f"/api/clips/{clip['id']}/export", json={"settings": settings}).json()
    job = client.get(f"/api/jobs/{job['id']}").json()
    assert job["status"] == "succeeded", job

    # Changing the texts changes the cache key (a fresh render).
    from sqlmodel import Session

    from twapza.db.models import Clip
    from twapza.db.session import get_engine
    from twapza.exports import ExportSettings, export_key
    with Session(get_engine()) as s:
        before = export_key(s.get(Clip, clip["id"]), ExportSettings())
    client.put(f"/api/clips/{clip['id']}/overlays", json={"overlays": []})
    with Session(get_engine()) as s:
        assert export_key(s.get(Clip, clip["id"]), ExportSettings()) != before


def test_hook_full_only_matters_with_hook_text():
    from twapza.exports import ExportSettings
    assert ExportSettings(hook_full=True).normalized().hook_full is False
    assert ExportSettings(hook_full=True, hook_text=True).normalized().hook_full is True


@requires_ffmpeg
def test_caption_fixes_apply_everywhere(client, clip):
    words = client.get(f"/api/clips/{clip['id']}/words").json()
    assert words[0]["text"] == words[0]["original"] == "w1"
    first, second = words[0], words[1]

    r = client.put(f"/api/projects/{clip['project_id']}/corrections",
                   json={"fixes": [{"start": first["start"], "text": " Hello "}, {"start": second["start"], "text": ""}]})
    assert r.status_code == 200, r.text
    assert r.json()[0]["text"].startswith("Hello w3")                       # clip text refreshed, w2 hidden
    words = client.get(f"/api/clips/{clip['id']}/words").json()
    assert (words[0]["text"], words[0]["original"]) == ("Hello", "w1") and words[1]["text"] == ""
    srt = client.get(f"/api/clips/{clip['id']}/subtitles.srt").text
    assert "Hello w3" in srt and "w2" not in srt.split("\n\n")[0]

    # Setting a word back to the original removes the fix.
    client.put(f"/api/projects/{clip['project_id']}/corrections",
               json={"fixes": [{"start": first["start"], "text": "w1"}]})
    assert client.get(f"/api/clips/{clip['id']}/words").json()[0]["text"] == "w1"

    bad = client.put(f"/api/projects/{clip['project_id']}/corrections", json={"fixes": [{"start": 9999, "text": "x"}]})
    assert bad.status_code == 400


@requires_ffmpeg
def test_caption_fixes_drop_cached_downloads(client, clip):
    from twapza.storage import get_storage

    job = client.post(f"/api/clips/{clip['id']}/export", json={"settings": {"aspect": "original"}}).json()
    key_job = client.get(f"/api/jobs/{job['id']}").json()
    assert key_job["status"] == "succeeded"
    prefix = f"projects/{clip['project_id']}/exports/{clip['id']}/"
    storage = get_storage()
    assert storage.list_children(prefix)
    first = client.get(f"/api/clips/{clip['id']}/words").json()[0]
    client.put(f"/api/projects/{clip['project_id']}/corrections", json={"fixes": [{"start": first["start"], "text": "Hey"}]})
    assert storage.list_children(prefix) == []


@requires_ffmpeg
def test_ai_focus_reaches_the_highlighter(client, monkeypatch, tmp_path):
    from twapza.workers import tasks

    seen = {}

    class Finder:
        def find(self, chunk, **kw):
            return json.dumps({"clips": []})

    monkeypatch.setattr(tasks, "get_highlighter", lambda **kw: seen.update(kw) or Finder())
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    from twapza.config import get_settings
    get_settings.cache_clear()
    pid = upload_file(client, make_test_video(tmp_path / "pod.mp4", seconds=20))["project"]["id"]
    client.post(f"/api/projects/{pid}/ai-clips", json={"focus": "  money tips "})
    assert seen == {"short": False, "focus": "money tips"}
    assert client.post(f"/api/projects/{pid}/ai-clips", json={"focus": "x" * 301}).status_code == 422

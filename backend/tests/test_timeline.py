"""Optional retention boosts: cut pauses, cold open, hook text."""

import json
import subprocess

import pytest

from tests.conftest import make_test_video, requires_ffmpeg, upload_file
from twapza.captions.ass import HOOK_SECONDS, build_ass, hook_event
from twapza.captions.srt import build_srt
from twapza.captions.style import CaptionSettings
from twapza.clipping.timeline import (
    Segment, find_quote, map_words, pick_teaser, remove_pauses, sentences, total_length,
    with_cold_open,
)
from twapza.media import ffmpeg
from twapza.transcription import Word


def W(text, start, end):
    return Word(text=text, start=start, end=end)


# Two sentences with pauses: lead-in silence, a 2 s gap, a short gap, and trailing silence.
WORDS = [W(" Hello", 1.0, 1.4), W(" there.", 1.5, 2.0),            # 1.0 s lead-in
         W(" This", 4.0, 4.3), W(" is", 4.35, 4.5), W(" wild!", 4.6, 5.4),  # 2 s gap before
         W(" Okay.", 5.6, 6.0)]                                     # 0.2 s gap (kept)


def test_remove_pauses_shortens_long_silences_only():
    segs = remove_pauses(WORDS, 0.0, 9.0)
    assert segs == [Segment(0.8, 2.1), Segment(3.9, 6.4)]
    # Every word is still fully inside the edit.
    for w in WORDS:
        assert any(s.start <= w.start and w.end <= s.end for s in segs)
    assert total_length(segs) == pytest.approx(3.8)


def test_remove_pauses_edge_cases():
    assert remove_pauses([], 0, 5) == [Segment(0, 5)]
    tight = [W("a", 0.0, 0.4), W("b", 0.5, 1.0)]
    assert remove_pauses(tight, 0, 1.0) == [Segment(0, 1.0)]


def test_map_words_follows_the_edited_timeline():
    segs = [Segment(4.0, 5.2), Segment(1.0, 2.0)]  # (cuts "wild!" short)  # teaser first, then the start
    mapped = map_words(WORDS, segs)
    assert [(w.text, w.start) for w in mapped] == [
        ("This", 0.0), ("is", 0.35), ("wild!", 0.6), ("Hello", 1.2), ("there.", 1.7)]
    assert mapped[-1].end == pytest.approx(2.2)


def test_find_quote():
    assert find_quote(WORDS, "this is WILD", 0, 9) == Segment(3.95, 5.55)
    assert find_quote(WORDS, "Hello there", 0, 9) is None          # shorter than 1.5 s
    assert find_quote(WORDS, "not in it", 0, 9) is None
    assert find_quote(WORDS, "this is wild", 0, 3) is None        # outside the clip
    assert find_quote(WORDS, "x", 0, 9) is None


def test_pick_teaser_prefers_loud_punchy_lines_but_never_the_opening():
    words = [W("Start", 0, 0.5), W("here.", 0.6, 2.2),
             W("Calm", 3, 3.5), W("sentence", 3.6, 4.2), W("now.", 4.3, 5.0),
             W("Big", 6, 6.5), W("news!", 6.6, 8.0)]
    assert len(sentences(words, 0, 10)) == 3
    assert pick_teaser(words, 0, 10) == Segment(5.95, 8.15)        # "!" wins without audio
    quiet_last = lambda s, e: -10.0 if s < 5 else -40.0            # noqa: E731
    assert pick_teaser(words, 0, 10, quiet_last) == Segment(2.95, 5.15)
    assert pick_teaser(words[:2], 0, 10) is None                   # only the opening sentence
    assert with_cold_open([Segment(0, 10)], None) == [Segment(0, 10)]


def test_hook_event_and_ass_document():
    assert hook_event("", 10) is None and hook_event("Hi", 0.2) is None
    ev = hook_event("He ate {WHAT}?", 10)
    assert (ev.start, ev.end) == (0.0, HOOK_SECONDS) and ev.text == "{\\fad(120,250)}He ate (WHAT)?"
    assert len(hook_event("word " * 40, 10).text) < 90

    # Hook only, without captions.
    doc = build_ass([], clip_start=0, clip_end=10, settings=None, hook="Big reveal", width=1080, height=1920)
    assert "Style: Hook," in doc and "Style: Caption," not in doc
    assert doc.splitlines()[-1].startswith("Dialogue: 1,0:00:00.00,0:00:03.00,Hook,")
    hook_style = next(line for line in doc.splitlines() if line.startswith("Style: Hook,")).split(",")
    assert hook_style[15] == "3" and hook_style[18] == "8"        # opaque box, top centre
    assert build_ass([], clip_start=0, clip_end=10, settings=None, width=1080, height=1920) is None

    # Captions at the top push the hook to the middle.
    doc = build_ass(WORDS, segments=[Segment(1, 6)], settings=CaptionSettings(position="top"),
                    hook="Hook", width=1080, height=1920)
    hook_style = next(line for line in doc.splitlines() if line.startswith("Style: Hook,")).split(",")
    assert hook_style[18] == "5"


def test_captions_and_srt_follow_the_segments():
    segs = with_cold_open(remove_pauses(WORDS, 0, 9), Segment(3.95, 5.55))
    srt = build_srt(WORDS, segments=segs)
    first, second = srt.split("\n\n")[:2]
    assert first.splitlines()[1:] == ["00:00:00,050 --> 00:00:01,800", "This is wild!"]
    assert second.splitlines()[2] == "Hello there."
    assert second.splitlines()[1].startswith("00:00:01,800")      # 1.6 s teaser + 0.2 s lead-in


# --- rendering ------------------------------------------------------------------------

def _colors_video(path):
    """2 s red, 2 s green, 2 s blue (with a tone) to check segment order."""
    subprocess.run([
        "ffmpeg", "-v", "error", "-y",
        "-f", "lavfi", "-i", "color=red:s=160x90:d=2:r=25", "-f", "lavfi", "-i", "color=green:s=160x90:d=2:r=25",
        "-f", "lavfi", "-i", "color=blue:s=160x90:d=2:r=25", "-f", "lavfi", "-i", "sine=f=440:d=6",
        "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-map", "3:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast", "-c:a", "aac", str(path)],
        check=True)
    return path


def _pixel(path, at):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(at), "-i", str(path), "-frames:v", "1",
                          "-vf", "scale=1:1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         check=True, capture_output=True).stdout
    return tuple(raw[:3])


@requires_ffmpeg
def test_cut_segments_plays_segments_in_order(tmp_path):
    src = _colors_video(tmp_path / "colors.mp4")
    out = tmp_path / "out.mp4"
    ffmpeg.cut_segments(src, out, [(4.5, 5.5), (0.5, 1.5), (2.5, 3.5)], preset="ultrafast")
    info = ffmpeg.probe(out)
    assert info.duration == pytest.approx(3.0, abs=0.15) and info.has_audio
    r, g, b = _pixel(out, 0.5)
    assert b > 150 and r < 80                                      # blue teaser first
    r, g, b = _pixel(out, 1.5)
    assert r > 150 and g < 80                                      # then red
    r, g, b = _pixel(out, 2.5)
    assert g > 100 and r < 80                                      # then green

    silent = tmp_path / "silent.mp4"
    ffmpeg.cut_segments(src, silent, [(0, 1), (3, 4)], has_audio=False, preset="ultrafast",
                        video_filter="scale=80:46")
    info = ffmpeg.probe(silent)
    assert not info.has_audio and info.width == 80
    with pytest.raises(ffmpeg.MediaError):
        ffmpeg.cut_segments(src, silent, [(1, 1)])


@pytest.fixture
def clip(client, tmp_path, monkeypatch):
    monkeypatch.setenv("TWAPZA_EXPORT_PRESET", "ultrafast")
    from twapza.config import get_settings
    get_settings.cache_clear()
    result = upload_file(client, make_test_video(tmp_path / "talk.mp4", seconds=20))
    pid = result["project"]["id"]
    assert client.post(f"/api/projects/{pid}/simple-clips", json={"target_seconds": 15}).status_code == 202
    return client.get(f"/api/projects/{pid}/clips").json()[0]


def _export(client, clip_id, **options):
    settings = {"aspect": "original", "upscale_1080": False, **options}
    job = client.post(f"/api/clips/{clip_id}/export", json={"settings": settings}).json()
    job = client.get(f"/api/jobs/{job['id']}").json()
    assert job["status"] == "succeeded", job
    r = client.get(job["download_url"])
    assert r.status_code == 200
    return job, r.content


@requires_ffmpeg
def test_export_with_retention_boosts(client, clip, tmp_path, fake_transcriber):
    plain_job, plain = _export(client, clip["id"])
    boosted_job, boosted = _export(client, clip["id"], cut_pauses=True, cold_open=True, hook_text=True)
    (tmp_path / "plain.mp4").write_bytes(plain)
    (tmp_path / "boosted.mp4").write_bytes(boosted)
    plain_len = ffmpeg.probe(tmp_path / "plain.mp4").duration
    boosted_len = ffmpeg.probe(tmp_path / "boosted.mp4").duration
    # The fake transcript has 0.4 s pauses between sentences → cut a little; the teaser adds 1.5-6 s.
    assert boosted_len != pytest.approx(plain_len, abs=0.3)

    # Same options again → the cached file is reused.
    _, again = _export(client, clip["id"], cut_pauses=True, cold_open=True, hook_text=True)
    assert again == boosted
    # The .srt with the same options follows the edited timeline.
    srt = client.get(f"/api/clips/{clip['id']}/subtitles.srt?cut_pauses=true&cold_open=true").text
    plain_srt = client.get(f"/api/clips/{clip['id']}/subtitles.srt").text
    assert srt != plain_srt and srt.startswith("1\n")


@requires_ffmpeg
def test_hook_text_uses_the_clip_title_and_changes_the_cache_key(client, clip):
    from sqlmodel import Session

    from twapza.db.models import Clip
    from twapza.db.session import get_engine
    from twapza.exports import ExportSettings, export_key

    settings = ExportSettings(hook_text=True)
    with Session(get_engine()) as s:
        row = s.get(Clip, clip["id"])
        before = export_key(row, settings)
        assert export_key(row, ExportSettings()) != before
    client.put(f"/api/clips/{clip['id']}/title", json={"title": "Wait for it"})
    with Session(get_engine()) as s:
        row = s.get(Clip, clip["id"])
        assert export_key(row, settings) != before
        assert export_key(row, ExportSettings()) == export_key(row, ExportSettings(cold_open=False))
    _export(client, clip["id"], hook_text=True)


@requires_ffmpeg
def test_short_style_and_teaser_reach_the_ai_job(client, monkeypatch, tmp_path, fake_transcriber):
    from sqlmodel import Session, select

    from twapza.db.models import Clip
    from twapza.db.session import get_engine
    from twapza.workers import tasks

    seen = {}

    class Finder:
        def find(self, chunk, **kw):
            line = chunk.lines[1]
            return json.dumps({"clips": [{
                "start": chunk.lines[0].start, "end": chunk.lines[0].start + 30, "title": "T",
                "hook": "H", "score": 80, "reason": "R", "teaser": line.text}]})

    def get_highlighter(**kw):
        seen.update(kw)
        return Finder()

    monkeypatch.setattr(tasks, "get_highlighter", get_highlighter)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    from twapza.config import get_settings
    get_settings.cache_clear()
    pid = upload_file(client, make_test_video(tmp_path / "pod.mp4", seconds=60))["project"]["id"]
    r = client.post(f"/api/projects/{pid}/ai-clips", json={"short": True})
    assert r.status_code == 202
    assert client.get(f"/api/jobs/{r.json()['id']}").json()["status"] == "succeeded"
    assert seen == {"short": True, "focus": None}
    with Session(get_engine()) as s:
        clip = s.exec(select(Clip).where(Clip.project_id == pid)).first()
        assert clip.teaser and clip.end - clip.start <= 45.5   # short style caps the length

    r = client.post(f"/api/projects/{pid}/ai-clips")              # no body = default style
    assert r.status_code == 202 and seen == {"short": False, "focus": None}


def test_short_style_prompt():
    from twapza.clipping.llm import system_prompt

    default, short = system_prompt(5), system_prompt(5, short=True, min_len=20, max_len=45)
    assert "between 15 and 90 seconds" in default and "loops well" not in default
    assert "between 20 and 45 seconds" in short and "loops well" in short
    assert "teaser:" in default


def test_runs_split_where_playback_jumps_back():
    assert ffmpeg._runs([(40, 44), (5, 6), (7, 9), (9, 10)]) == [[(40, 44)], [(5, 6), (7, 9), (9, 10)]]
    assert str(ffmpeg._frame_rate(29.97002997)) == "30000/1001"
    assert ffmpeg._frame_rate(None) == 30 and ffmpeg._frame_rate(25.0) == 25


@requires_ffmpeg
def test_many_cuts_keep_audio_and_video_in_sync(tmp_path):
    """Lots of segments at 29.97 fps: audio and video must end up the same length."""
    src = tmp_path / "ntsc.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x240:r=30000/1001:d=40",
                    "-f", "lavfi", "-i", "sine=f=300:d=40", "-c:v", "libx264", "-preset", "ultrafast",
                    "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(src)], check=True)
    segments = [(30.0, 33.2)] + [(2 + i * 1.37, 2 + i * 1.37 + 0.91) for i in range(25)]
    out = tmp_path / "cut.mp4"
    ffmpeg.cut_segments(src, out, segments, fps=ffmpeg.probe(src).fps, preset="ultrafast")
    streams = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,duration",
                              "-of", "csv=p=0", str(out)], check=True, capture_output=True, text=True).stdout
    durations = {kind: float(d) for kind, d in (line.split(",") for line in streams.split())}
    expected = sum(b - a for a, b in segments)
    assert durations["video"] == pytest.approx(expected, abs=0.1)
    assert abs(durations["video"] - durations["audio"]) < 1 / 29.97 + 0.03


def test_killed_ffmpeg_gets_a_readable_message(monkeypatch):
    class Killed:
        def __init__(self, *a, **kw):
            import io
            self.stdout = io.StringIO("")

        def wait(self):
            return -9

    monkeypatch.setattr(ffmpeg.subprocess, "Popen", Killed)
    with pytest.raises(ffmpeg.MediaError, match="out of memory"):
        ffmpeg.run_ffmpeg(["-version"])

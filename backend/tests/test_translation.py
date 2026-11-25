"""Caption translation: sentences, retiming, Claude request shape and the API flow."""

import json
from typing import get_args

import pytest

from tests.conftest import make_test_video, requires_ffmpeg, upload_file
from twapza.captions.srt import build_srt
from twapza.clipping.timeline import Segment, map_words, remove_pauses
from twapza.clipping.translation import (
    LANGUAGES, TRANSLATION_SCHEMA, ClaudeTranslator, Language, parse_translation, retime, sentence_key,
    split_sentences, translated_words,
)
from twapza.exports import ExportSettings
from twapza.transcription.base import Word


def W(text, start, end):
    return Word(text=f" {text}", start=start, end=end)


SPEECH = [
    W("So", 0.0, 0.2), W("um", 0.3, 0.5), W("this", 0.6, 0.9), W("works.", 1.0, 1.4),
    W("Really", 3.0, 3.4), W("well!", 3.5, 3.9),
]


def test_languages_match_the_type():
    assert set(get_args(Language)) == set(LANGUAGES)


def test_sentences_skip_fillers_and_split_on_ends_and_pauses():
    sentences = split_sentences(SPEECH)
    assert [[w.text.strip() for w in s] for s in sentences] == [["So", "this", "works."], ["Really", "well!"]]


def test_retime_stays_inside_the_spoken_words():
    sentence = split_sentences(SPEECH)[0]
    out = retime(sentence, "Dus dit werkt echt goed.")
    assert [w.text for w in out] == [" Dus", " dit", " werkt", " echt", " goed."]
    slots = [(w.start, w.end) for w in sentence]
    for w in out:
        assert any(s <= w.start and w.end <= e for s, e in slots), w
        assert w.end - w.start >= 0.019
    assert [w.start for w in out] == sorted(w.start for w in out)
    assert out[0].start == 0.0 and out[-1].end == 1.4
    assert retime(sentence, "   ") == []


def test_translated_words_replace_only_cached_sentences():
    first = split_sentences(SPEECH)[0]
    words = translated_words(SPEECH, {sentence_key(first[0]): "Dit werkt."})
    assert [w.text.strip() for w in words] == ["Dit", "werkt.", "Really", "well!"]


def test_translated_captions_survive_cut_pauses():
    first = split_sentences(SPEECH)[0]
    words = translated_words(SPEECH, {sentence_key(first[0]): "Dit werkt echt."})
    segments = remove_pauses(SPEECH, 0, 4, pauses=True)
    shown = [w.text for w in map_words(words, segments)]
    assert shown == ["Dit", "werkt", "echt.", "Really", "well!"]
    assert "Dit" in build_srt(words, segments=[Segment(0, 4)])


def test_parse_translation_is_tolerant():
    raw = 'Sure: {"lines": [{"id": 0, "text": " Hallo  wereld "}, {"id": 7, "text": "x"}, {"id": "1", "text": ""}]}'
    assert parse_translation(raw, [0, 1]) == {0: "Hallo wereld"}
    assert parse_translation("nonsense", [0]) == {}


def test_settings_drop_the_language_without_captions():
    assert ExportSettings(caption_language="nl").normalized().caption_language is None
    with pytest.raises(ValueError):
        ExportSettings(caption_language="zh")


def _sse(events):
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


def test_real_sdk_request_on_the_wire():
    anthropic = pytest.importorskip("anthropic")
    import httpx2

    seen = []

    def handler(request):
        body = json.loads(request.content)
        seen.append(body)
        ids = [int(line.split("\t")[0]) for line in body["messages"][0]["content"].split("<lines>\n")[1]
               .split("\n</lines>")[0].splitlines()]
        answer = json.dumps({"lines": [{"id": i, "text": f"vertaald {i}"} for i in ids]})
        events = [
            {"type": "message_start", "message": {
                "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-sonnet-5-5",
                "content": [], "stop_reason": None, "stop_sequence": None,
                "usage": {"input_tokens": 10, "output_tokens": 0}}},
            {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
            {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": answer}},
            {"type": "content_block_stop", "index": 0},
            {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None},
             "usage": {"output_tokens": 20}},
            {"type": "message_stop"},
        ]
        return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=_sse(events))

    client = anthropic.Anthropic(api_key="sk-test", max_retries=0,
                                 http_client=httpx2.Client(transport=httpx2.MockTransport(handler)))
    translator = ClaudeTranslator(api_key="sk-test", model="claude-sonnet-5-5", client=client)
    lines = [f"line {i}" for i in range(130)]
    out = translator.translate(lines, "nl")
    assert out[0] == "vertaald 0" and out[129] == "vertaald 129"
    assert len(seen) == 2  # 120 lines per request
    body = seen[0]
    assert body["output_config"] == {"effort": "low",
                                     "format": {"type": "json_schema", "schema": TRANSLATION_SCHEMA}}
    assert body["fallbacks"] == "default" and "Dutch" in body["system"]
    assert "thinking" not in body and "tool_choice" not in body


# --- API -----------------------------------------------------------------------------

class FakeTranslator:
    def __init__(self):
        self.calls = []

    def translate(self, lines, language):
        self.calls.append((list(lines), language))
        return [f"[{language}] {line}" for line in lines]


@pytest.fixture
def translator(app):
    from twapza.api.routes.clips import get_translator

    fake = FakeTranslator()
    app.dependency_overrides[get_translator] = lambda: fake
    return fake


def _first_clip(client, tmp_path):
    result = upload_file(client, make_test_video(tmp_path / "talk.mp4", seconds=20))
    pid = result["project"]["id"]
    assert client.post(f"/api/projects/{pid}/simple-clips", json={"target_seconds": 15}).status_code == 202
    return pid, client.get(f"/api/projects/{pid}/clips").json()[0]


@requires_ffmpeg
def test_translate_preview_srt_and_export(client, translator, tmp_path):
    pid, clip = _first_clip(client, tmp_path)

    r = client.post(f"/api/clips/{clip['id']}/translation", json={"language": "nl"})
    assert r.status_code == 200, r.text
    words = r.json()
    assert words and words[0]["text"] == "[nl]"
    assert all(clip["start"] - 1 < w["start"] < clip["end"] + 1 for w in words)
    assert len(translator.calls) == 1

    # Cached: the subtitles and the download don't ask Claude again.
    srt = client.get(f"/api/clips/{clip['id']}/subtitles.srt", params={"language": "nl"})
    assert srt.status_code == 200 and "[nl]" in srt.text
    settings = {"captions": {}, "caption_language": "nl"}
    r = client.post(f"/api/clips/{clip['id']}/export", json={"settings": settings})
    assert r.status_code == 202, r.text
    assert len(translator.calls) == 1

    # The spoken language needs no translation.
    assert client.post(f"/api/clips/{clip['id']}/translation", json={"language": "en"}).status_code == 200
    assert len(translator.calls) == 1

    # Fixing a caption word clears the translations (they were made from the old words).
    first = client.get(f"/api/clips/{clip['id']}/words").json()[0]
    r = client.put(f"/api/projects/{pid}/corrections", json={"fixes": [{"start": first["start"], "text": "Hello"}]})
    assert r.status_code == 200, r.text
    client.post(f"/api/clips/{clip['id']}/translation", json={"language": "nl"})
    assert len(translator.calls) == 2


@requires_ffmpeg
def test_translation_needs_creator(free_client, translator, tmp_path):
    _, clip = _first_clip(free_client, tmp_path)
    r = free_client.post(f"/api/clips/{clip['id']}/translation", json={"language": "nl"})
    assert r.status_code == 402
    r = free_client.post(f"/api/clips/{clip['id']}/export",
                         json={"settings": {"captions": {}, "caption_language": "nl"}})
    assert r.status_code == 402
    assert translator.calls == []


@requires_ffmpeg
def test_without_a_key_translation_is_unavailable(client, app, tmp_path):
    from twapza.api.routes.clips import get_translator

    app.dependency_overrides[get_translator] = lambda: None
    _, clip = _first_clip(client, tmp_path)
    r = client.post(f"/api/clips/{clip['id']}/translation", json={"language": "nl"})
    assert r.status_code == 503

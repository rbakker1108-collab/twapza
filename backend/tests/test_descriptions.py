"""Clip descriptions for YouTube Shorts with a credit to the original creator."""

import json

import pytest

from tests.conftest import make_test_video, requires_ffmpeg, upload_file
from twapza.clipping.descriptions import (
    DESCRIPTION_SCHEMA, ClaudeDescriber, Credit, compose, credit_text, fallback_copy,
    normalize_hashtags, parse_copy, user_prompt,
)

FAZER = Credit(creator="Joe Fazer", title="I Survived Alone In The Amazon Rainforest for 4 Days",
               video_url="https://www.youtube.com/watch?v=MjtJbhuFngg",
               channel_url="https://www.youtube.com/@JoeFazer")


def test_credit_matches_the_requested_format():
    assert credit_text(FAZER) == (
        "Clips used from Joe Fazer’s video “I Survived Alone In The Amazon Rainforest for 4 Days”\n"
        "Original video: https://www.youtube.com/watch?v=MjtJbhuFngg\n"
        "Channel: https://www.youtube.com/@JoeFazer"
    )


@pytest.mark.parametrize("credit,expected", [
    (Credit(creator="Ann"), "Clips used from a video by Ann"),
    (Credit(title="Talk"), "Clips used from the video “Talk”"),
    (Credit(video_url="https://youtu.be/x"), "Original video: https://youtu.be/x"),
    (Credit(creator="  ", title=""), None),
    (Credit(), None),
])
def test_partial_credits(credit, expected):
    assert credit_text(credit) == expected


def test_normalize_hashtags():
    assert normalize_hashtags(["Amazon Survival", "#shorts", "SHORTS", "#jungle!", "123", ""]) == \
        ["#AmazonSurvival", "#shorts", "#jungle"]
    assert normalize_hashtags([]) == ["#shorts"]
    assert normalize_hashtags("#a #b") == ["#a", "#b", "#shorts"]
    many = normalize_hashtags([f"t{i}" for i in range(10)])
    assert len(many) == 5 and many[-1] == "#shorts"
    assert normalize_hashtags(["überleben"]) == ["#überleben", "#shorts"]


def test_compose_order():
    text = compose("Hook line\nMore", ["#a", "#shorts"], credit_text(FAZER))
    parts = text.split("\n\n")
    assert parts[0] == "Hook line\nMore"
    assert parts[1].startswith("Clips used from Joe Fazer’s video")
    assert parts[2] == "#a #shorts"
    assert compose("Hi", ["#shorts"], None) == "Hi\n\n#shorts"


def test_parse_copy_is_tolerant():
    ok = parse_copy(json.dumps({"description": "He ate a grub 😳 #jungle #wow", "hashtags": ["survival"]}))
    assert ok.description == "He ate a grub 😳" and ok.hashtags == ["#survival", "#shorts"]
    wrapped = parse_copy('Here you go: {"description": "D", "hashtags": "a b"}')
    assert wrapped.description == "D" and wrapped.hashtags == ["#a", "#b", "#shorts"]
    for bad in ["", "nope", "[]", '{"description": ""}', '{"hashtags": ["x"]}', None]:
        assert parse_copy(bad) is None
    assert len(parse_copy(json.dumps({"description": "x" * 2000, "hashtags": []})).description) == 600


def test_fallback_copy():
    c = fallback_copy(title="The grub", hook="It tasted like coconut", text="...")
    assert c.description == "The grub\n“It tasted like coconut”\nWatch the full video, linked below 👇"
    assert c.hashtags == ["#shorts"]
    plain = fallback_copy(title=None, hook=None, text=" I found water.  Then it rained. ")
    assert plain.description.startswith("“I found water.”")
    assert fallback_copy(title=None, hook=None, text="").description == "Watch the full video, linked below 👇"


def test_prompt_contains_clip_and_source():
    p = user_prompt(clip_text="We found a river.", clip_title="River", clip_hook=None, duration=42.4,
                    credit=FAZER)
    assert "Original video title: I Survived Alone" in p and "Original creator: Joe Fazer" in p
    assert "Clip length: 42 seconds" in p and "<transcript>\nWe found a river.\n</transcript>" in p
    assert "Clip hook" not in p


def _sse(events):
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


def test_real_sdk_request_on_the_wire():
    anthropic = pytest.importorskip("anthropic")
    import httpx2

    answer = json.dumps({"description": "Day 3 in the Amazon and the rain won't stop 🌧️",
                         "hashtags": ["amazon", "survival"]})
    seen = {}

    def handler(request):
        seen["headers"] = dict(request.headers)
        seen["body"] = json.loads(request.content)
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
    out = ClaudeDescriber(api_key="sk-test", model="claude-sonnet-5-5", client=client).write("prompt")
    assert parse_copy(out).hashtags == ["#amazon", "#survival", "#shorts"]
    body = seen["body"]
    assert "server-side-fallback-2026-07-01" in seen["headers"]["anthropic-beta"]
    assert body["fallbacks"] == "default" and body["model"] == "claude-sonnet-5-5"
    assert body["output_config"] == {"effort": "medium",
                                     "format": {"type": "json_schema", "schema": DESCRIPTION_SCHEMA}}
    assert body["messages"] == [{"role": "user", "content": "prompt"}]
    assert "thinking" not in body and "tool_choice" not in body


# --- API -----------------------------------------------------------------------------

class FakeDescriber:
    def __init__(self, answers):
        self.answers = list(answers)
        self.prompts = []

    def write(self, prompt):
        self.prompts.append(prompt)
        return self.answers.pop(0)


@pytest.fixture
def clip(client, tmp_path):
    result = upload_file(client, make_test_video(tmp_path / "talk.mp4", seconds=20))
    pid = result["project"]["id"]
    r = client.post(f"/api/projects/{pid}/simple-clips", json={"target_seconds": 15})
    assert r.status_code == 202, r.text
    return client.get(f"/api/projects/{pid}/clips").json()[0]


def _use(client, describer):
    from twapza.api.routes.clips import get_describer
    client.app.dependency_overrides[get_describer] = lambda: describer


@requires_ffmpeg
def test_credit_can_be_edited_and_shows_in_the_description(client, clip):
    pid = clip["project_id"]
    r = client.get(f"/api/clips/{clip['id']}/description")
    assert r.status_code == 200 and r.json()["credit"] is None and r.json()["ai"] is False

    r = client.patch(f"/api/projects/{pid}", json={
        "source_channel": " Joe  Fazer ", "source_title": FAZER.title,
        "source_url": FAZER.video_url, "source_channel_url": FAZER.channel_url})
    assert r.status_code == 200, r.text
    assert r.json()["source_channel"] == "Joe Fazer"
    desc = client.get(f"/api/clips/{clip['id']}/description").json()
    assert desc["credit"] == credit_text(FAZER)
    assert credit_text(FAZER) in desc["text"] and desc["text"].endswith("#shorts")

    # Partial update keeps the other fields; blank clears one.
    client.patch(f"/api/projects/{pid}", json={"source_channel_url": ""})
    project = client.get(f"/api/projects/{pid}").json()
    assert project["source_channel_url"] is None and project["source_channel"] == "Joe Fazer"

    bad = client.patch(f"/api/projects/{pid}", json={"source_url": "javascript:alert(1)"})
    assert bad.status_code == 422


@requires_ffmpeg
def test_claude_writes_and_saves_descriptions(client, clip):
    pid = clip["project_id"]
    client.patch(f"/api/projects/{pid}", json={"source_channel": "Joe Fazer", "source_title": "Jungle"})
    fake = FakeDescriber([json.dumps({"description": "First", "hashtags": ["jungle"]}),
                          json.dumps({"description": "Second", "hashtags": []}),
                          "garbage"])
    _use(client, fake)

    r = client.post(f"/api/clips/{clip['id']}/description")
    assert r.status_code == 200, r.text
    assert r.json() == {
        "text": "First\n\nClips used from Joe Fazer’s video “Jungle”\n\n#jungle #shorts",
        "description": "First", "hashtags": ["#jungle", "#shorts"],
        "credit": "Clips used from Joe Fazer’s video “Jungle”", "ai": True,
    }
    assert "Original creator: Joe Fazer" in fake.prompts[0] and "w1" in fake.prompts[0]
    assert client.get(f"/api/clips/{clip['id']}/description").json()["description"] == "First"  # saved

    assert client.post(f"/api/clips/{clip['id']}/description").json()["description"] == "Second"
    r = client.post(f"/api/clips/{clip['id']}/description")
    assert r.status_code == 502 and "usable description" in r.json()["detail"]
    assert client.get(f"/api/clips/{clip['id']}/description").json()["description"] == "Second"

    # Trimming makes the saved description stale, so it is dropped.
    client.patch(f"/api/clips/{clip['id']}", json={"start": clip["start"], "end": clip["end"] - 2})
    assert client.get(f"/api/clips/{clip['id']}/description").json()["ai"] is False


@requires_ffmpeg
def test_without_a_key_post_returns_the_simple_description(client, clip):
    _use(client, None)
    r = client.post(f"/api/clips/{clip['id']}/description")
    assert r.status_code == 200 and r.json()["ai"] is False
    assert "Watch the full video" in r.json()["text"]


@requires_ffmpeg
def test_claude_errors_are_readable(client, clip):
    from twapza.clipping.llm import HighlightError

    class Broken:
        def write(self, prompt):
            raise HighlightError("Claude API rate limit reached. Wait a minute and try again.")

    _use(client, Broken())
    r = client.post(f"/api/clips/{clip['id']}/description")
    assert r.status_code == 502 and r.json()["detail"].startswith("Claude API rate limit")

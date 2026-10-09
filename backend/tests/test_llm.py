import json
from types import SimpleNamespace

import pytest

from twapza.clipping.llm import (
    HIGHLIGHT_SCHEMA, ClaudeHighlighter, HighlightError, Line, chunk_lines, parse_highlights,
    system_prompt, transcript_lines, user_prompt,
)
from twapza.transcription import Word


def W(text, start, end):
    return Word(text=text, start=start, end=end)


# --- transcript_lines -------------------------------------------------------------

def test_lines_split_at_sentence_ends():
    words = [W(" Hello", 0, 0.4), W(" there.", 0.5, 0.9), W(" How", 1.0, 1.2), W(" are", 1.3, 1.4),
             W(" you?", 1.5, 1.8)]
    lines = transcript_lines(words)
    assert [(ln.start, ln.end, ln.text) for ln in lines] == [
        (0, 0.9, "Hello there."), (1.0, 1.8, "How are you?")]


def test_lines_split_at_long_pauses_and_max_length_and_sort_words():
    words = [W(" b", 0.5, 0.8), W(" a", 0, 0.3), W(" c", 3.0, 3.2)]  # unsorted, 2.2s pause
    assert [ln.text for ln in transcript_lines(words)] == ["a b", "c"]
    many = [W(f" w{i}", i * 0.3, i * 0.3 + 0.2) for i in range(65)]
    assert [len(ln.text.split()) for ln in transcript_lines(many, max_words=30)] == [30, 30, 5]


# --- chunk_lines ---------------------------------------------------------------------

def lines_every(seconds: float, total: float) -> list[Line]:
    out, t = [], 0.0
    while t < total:
        out.append(Line(t, t + seconds - 0.5, f"line at {t:.0f}"))
        t += seconds
    return out


def test_chunks_overlap_and_cover_every_line():
    lines = lines_every(10, 1200)  # 20 minutes
    chunks = chunk_lines(lines, chunk_seconds=480, overlap=60)
    assert [c.index for c in chunks] == list(range(len(chunks)))
    assert len(chunks) == 3
    covered = {ln for c in chunks for ln in c.lines}
    assert covered == set(lines)
    # consecutive chunks share ~60s of lines
    shared = set(chunks[0].lines) & set(chunks[1].lines)
    assert 50 <= sum(1 for _ in shared) * 10 <= 70


def test_chunk_render_has_timestamps():
    chunk = chunk_lines([Line(12.34, 14, "Hi."), Line(15, 16, "Bye.")])[0]
    assert chunk.render() == "[12.3] Hi.\n[15.0] Bye."


def test_chunking_edge_cases():
    assert chunk_lines([]) == []
    assert len(chunk_lines(lines_every(10, 100))) == 1
    with pytest.raises(ValueError):
        chunk_lines(lines_every(10, 100), chunk_seconds=60, overlap=60)


def test_prompts():
    assert "at most 4 moments" in system_prompt(4)
    chunk = chunk_lines(lines_every(10, 100))[0]
    prompt = user_prompt(chunk, video_title="My talk.mp4", video_duration=3600, total_chunks=7)
    assert "My talk.mp4" in prompt and "part 1 of 7" in prompt and "[0.0] line at 0" in prompt


# --- parse_highlights ------------------------------------------------------------------

def item(**over):
    return {"start": 100, "end": 140, "title": "Big idea", "hook": "Nobody tells you this",
            "score": 87, "reason": "Surprising claim with a payoff."} | over


def parse(raw, **kw):
    return parse_highlights(raw, chunk_start=kw.pop("chunk_start", 0),
                            chunk_end=kw.pop("chunk_end", 600), **kw)


def test_parses_well_formed_output():
    [c] = parse(json.dumps({"clips": [item()]}))
    assert (c.start, c.end, c.title, c.hook, c.score) == (100, 140, "Big idea", "Nobody tells you this", 87)


@pytest.mark.parametrize("raw", [
    "```json\n" + json.dumps({"clips": [item()]}) + "\n```",
    "Here are the best moments:\n" + json.dumps({"clips": [item()]}) + "\nHope this helps!",
    json.dumps([item()]),  # bare list
    "Sure! " + json.dumps([item()]),
    {"clips": [item()]},  # already parsed
    {"highlights": [item()]},  # alternative key
])
def test_tolerates_wrappers_and_shapes(raw):
    assert len(parse(raw)) == 1


@pytest.mark.parametrize("raw", ["", "no json here", "{broken", "null", '"just a string"', "42",
                                 '{"clips": "nope"}'])
def test_garbage_returns_empty_list(raw):
    assert parse(raw) == []


def test_bad_items_are_skipped_not_fatal():
    raw = {"clips": [
        "not a dict", None, item(start=None), item(end="soon"), item(start=True),
        item(start=10, end=12),  # too short
        item(start=200, end=240),  # fine
    ]}
    assert [(c.start, c.end) for c in parse(raw)] == [(200, 240)]


def test_coerces_times():
    raw = {"clips": [item(start="1:40", end="2:20.5"), item(start="300.5", end="340s"),
                     item(start="0:01:00", end="0:01:30")]}
    assert [(c.start, c.end) for c in parse(raw)] == [(100, 140.5), (300.5, 340), (60, 90)]


def test_swaps_reversed_and_clamps_to_chunk_and_max_length():
    raw = {"clips": [item(start=160, end=120), item(start=-5, end=30), item(start=580, end=700),
                     item(start=100, end=300)]}
    got = [(c.start, c.end) for c in parse(raw, chunk_start=0, chunk_end=600, max_len=90)]
    # reversed → swapped; negative start → 0; end past chunk → chunk end; too long → 90s
    assert got == [(120, 160), (0, 30), (580, 600), (100, 190)]


def test_clamping_can_make_a_clip_too_short():
    # Mostly outside this chunk: after clamping only 5s remain → dropped.
    assert parse({"clips": [item(start=595, end=640)]}, chunk_end=600) == []


def test_min_length_has_tolerance():
    assert len(parse({"clips": [item(start=0, end=12.5)]}, min_len=15)) == 1  # within 3s
    assert parse({"clips": [item(start=0, end=11)]}, min_len=15) == []


@pytest.mark.parametrize("score,expected", [(150, 100), (-3, 0), ("72", 72), (None, 50), ("high", 50),
                                            (float("nan"), 50), (64.6, 64.6)])
def test_score_is_coerced(score, expected):
    [c] = parse({"clips": [item(score=score)]})
    assert c.score == expected


def test_missing_score_defaults_and_text_is_cleaned():
    raw = {"clips": [{"start": 0, "end": 30, "title": "  Two\n spaces ", "reason": "x" * 900}]}
    [c] = parse(raw)
    assert c.score == 50 and c.title == "Two spaces" and c.hook == "" and len(c.reason) == 500
    [untitled] = parse({"clips": [item(title="")]})
    assert untitled.title == "Untitled moment"


def test_schema_matches_parser_fields():
    props = HIGHLIGHT_SCHEMA["properties"]["clips"]["items"]["properties"]
    assert set(props) == {"start", "end", "title", "hook", "score", "reason"}


# --- ClaudeHighlighter request shape ----------------------------------------------------

class FakeStream:
    def __init__(self, message):
        self.message = message

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def get_final_message(self):
        return self.message


def fake_client(message=None, error=None):
    calls = []

    def stream(**kwargs):
        calls.append(kwargs)
        if error:
            raise error
        return FakeStream(message)

    client = SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(stream=stream)))
    return client, calls


def chunk():
    return chunk_lines([Line(0, 5, "Hello."), Line(6, 10, "World.")])[0]


def message(stop_reason="end_turn", text='{"clips": []}'):
    return SimpleNamespace(stop_reason=stop_reason, stop_details=None, content=[
        SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)])


def test_highlighter_sends_structured_output_request():
    client, calls = fake_client(message(text='{"clips": [1]}'))
    h = ClaudeHighlighter(api_key="k", model="claude-sonnet-5-5", effort="high", max_per_chunk=3,
                          client=client)
    out = h.find(chunk(), video_title="v.mp4", video_duration=10, total_chunks=1)
    assert out == '{"clips": [1]}'  # text blocks only, thinking skipped
    [kw] = calls
    assert kw["model"] == "claude-sonnet-5-5"
    assert kw["output_config"]["effort"] == "high"
    assert kw["output_config"]["format"] == {"type": "json_schema", "schema": HIGHLIGHT_SCHEMA}
    assert kw["fallbacks"] == "default" and kw["betas"] == ["server-side-fallback-2026-07-01"]
    assert kw["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert "at most 3 moments" in kw["system"][0]["text"]
    assert "tool_choice" not in kw and "temperature" not in kw
    assert "[0.0] Hello." in kw["messages"][0]["content"]


def test_highlighter_treats_refusal_as_no_moments():
    client, _ = fake_client(message(stop_reason="refusal", text="I can't help with that"))
    h = ClaudeHighlighter(api_key="k", model="m", client=client)
    assert h.find(chunk(), video_title="v", video_duration=10, total_chunks=1) == '{"clips": []}'


def _api_error(cls, status):
    import anthropic
    import httpx2

    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("boom", response=httpx2.Response(status, request=request), body=None)


@pytest.mark.parametrize("cls_name,status,needle", [
    ("AuthenticationError", 401, "ANTHROPIC_API_KEY"),
    ("NotFoundError", 404, "TWAPZA_CLAUDE_MODEL"),
    ("RateLimitError", 429, "rate limit"),
    ("InternalServerError", 500, r"Claude API error \(500\)"),
])
def test_highlighter_turns_api_errors_into_readable_messages(cls_name, status, needle):
    anthropic = pytest.importorskip("anthropic")
    client, _ = fake_client(error=_api_error(getattr(anthropic, cls_name), status))
    h = ClaudeHighlighter(api_key="k", model="m", client=client)
    with pytest.raises(HighlightError, match=needle):
        h.find(chunk(), video_title="v", video_duration=10, total_chunks=1)


def _sse(events):
    return "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events).encode()


def test_real_sdk_request_on_the_wire():
    """Drive the real Anthropic SDK against a mock HTTP transport.

    Proves the SDK accepts our parameters, serialises them as the API expects
    (beta header, fallbacks, JSON schema, effort, cached system prompt), and that
    we read the streamed answer correctly.
    """
    anthropic = pytest.importorskip("anthropic")
    import httpx2

    answer = json.dumps({"clips": [{"start": 1, "end": 30, "title": "T", "hook": "H", "score": 80,
                                    "reason": "R"}]})
    seen = {}

    def handler(request: httpx2.Request) -> httpx2.Response:
        seen["url"] = str(request.url)
        seen["headers"] = dict(request.headers)
        seen["body"] = json.loads(request.content)
        events = [
            {"type": "message_start", "message": {
                "id": "msg_1", "type": "message", "role": "assistant", "model": "claude-sonnet-5-5",
                "content": [], "stop_reason": None, "stop_sequence": None,
                "usage": {"input_tokens": 10, "output_tokens": 0}}},
            {"type": "content_block_start", "index": 0, "content_block": {"type": "text", "text": ""}},
            {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": answer[:20]}},
            {"type": "content_block_delta", "index": 0, "delta": {"type": "text_delta", "text": answer[20:]}},
            {"type": "content_block_stop", "index": 0},
            {"type": "message_delta", "delta": {"stop_reason": "end_turn", "stop_sequence": None},
             "usage": {"output_tokens": 50}},
            {"type": "message_stop"},
        ]
        return httpx2.Response(200, headers={"content-type": "text/event-stream"}, content=_sse(events))

    client = anthropic.Anthropic(api_key="sk-test", max_retries=0,
                                 http_client=httpx2.Client(transport=httpx2.MockTransport(handler)))
    h = ClaudeHighlighter(api_key="sk-test", model="claude-sonnet-5-5", effort="high", client=client)
    out = h.find(chunk(), video_title="v.mp4", video_duration=10, total_chunks=1)

    assert parse_highlights(out, chunk_start=0, chunk_end=60)[0].title == "T"
    assert seen["url"].endswith("/v1/messages?beta=true") or seen["url"].endswith("/v1/messages")
    assert "server-side-fallback-2026-07-01" in seen["headers"]["anthropic-beta"]
    assert seen["headers"]["x-api-key"] == "sk-test"
    body = seen["body"]
    assert body["model"] == "claude-sonnet-5-5" and body["stream"] is True
    assert body["fallbacks"] == "default"
    assert body["output_config"] == {"effort": "high",
                                     "format": {"type": "json_schema", "schema": HIGHLIGHT_SCHEMA}}
    assert body["system"][0]["cache_control"] == {"type": "ephemeral"}
    assert body["max_tokens"] == 32000
    assert "thinking" not in body and "tool_choice" not in body

import sys
import types
from types import SimpleNamespace

from twapza.transcription import Segment, Transcript, Word
from twapza.transcription.faster_whisper import FasterWhisperTranscriber, _load_model


def sample() -> Transcript:
    return Transcript(language="nl", duration=10, segments=[
        Segment(0, 4, "Hallo daar.", [Word(" Hallo", 0.5, 1.0, 0.9), Word(" daar.", 1.1, 1.6)]),
        Segment(5, 9, "Tot ziens", [Word(" Tot", 5.0, 5.4), Word(" ziens", 5.5, 6.0)]),
    ])


def test_json_roundtrip_preserves_everything():
    t = sample()
    assert Transcript.from_json(t.to_json()) == t


def test_words_and_text_between():
    t = sample()
    assert [w.text for w in t.words] == [" Hallo", " daar.", " Tot", " ziens"]
    assert t.text_between(0, 5) == "Hallo daar."
    assert t.text_between(1.3, 5.6) == "daar. Tot"  # by word midpoint


def test_empty_transcript():
    t = Transcript.empty(12.5)
    assert t.words == [] and t.duration == 12.5
    assert Transcript.from_json(t.to_json()) == t


def test_faster_whisper_adapter(monkeypatch, tmp_path):
    """The adapter maps faster-whisper's output and reports progress (model stubbed)."""
    calls = {}

    class StubModel:
        def __init__(self, size, device, compute_type, download_root):
            calls["init"] = (size, device, compute_type, download_root)

        def transcribe(self, path, **kwargs):
            calls["kwargs"] = kwargs
            w = lambda word, s, e: SimpleNamespace(word=word, start=s, end=e, probability=0.87654)
            segs = [
                SimpleNamespace(start=0.0, end=2.0, text=" Hi there.", words=[w(" Hi", 0.1, 0.4), w(" there.", 0.5, 1.9)]),
                SimpleNamespace(start=3.0, end=4.0, text=" Bye", words=[w(" Bye", 3.1, 3.5)]),
            ]
            return iter(segs), SimpleNamespace(duration=4.0, language="en")

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=StubModel))
    _load_model.cache_clear()
    progress = []
    t = FasterWhisperTranscriber("tiny", language="", download_root=tmp_path / "models").transcribe(
        tmp_path / "audio.wav", duration=4.2, on_progress=progress.append)
    _load_model.cache_clear()

    assert calls["init"] == ("tiny", "cpu", "int8", str(tmp_path / "models"))
    assert calls["kwargs"] == {"language": None, "word_timestamps": True, "vad_filter": True}
    assert t.language == "en" and t.duration == 4.2
    assert [s.text for s in t.segments] == ["Hi there.", "Bye"]
    assert t.words[1] == Word(" there.", 0.5, 1.9, 0.877)
    assert progress == [0.5, 1.0, 1.0]

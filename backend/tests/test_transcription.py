import sys
import types
from types import SimpleNamespace

from twapza.transcription import Segment, Transcript, Word
import numpy as np
import pytest

from tests.conftest import requires_ffmpeg
from twapza.media import ffmpeg
from twapza.transcription.faster_whisper import FasterWhisperTranscriber, _load_model, load_wav_16k


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

        def transcribe(self, audio, **kwargs):
            calls["audio"] = audio
            calls["kwargs"] = kwargs
            w = lambda word, s, e: SimpleNamespace(word=word, start=s, end=e, probability=0.87654)
            segs = [
                SimpleNamespace(start=0.0, end=2.0, text=" Hi there.", words=[w(" Hi", 0.1, 0.4), w(" there.", 0.5, 1.9)]),
                SimpleNamespace(start=3.0, end=4.0, text=" Bye", words=[w(" Bye", 3.1, 3.5)]),
            ]
            return iter(segs), SimpleNamespace(duration=4.0, language="en")

    monkeypatch.setitem(sys.modules, "faster_whisper", types.SimpleNamespace(WhisperModel=StubModel))
    _load_model.cache_clear()
    monkeypatch.setattr("twapza.transcription.faster_whisper.load_wav_16k",
                        lambda path: np.zeros(16000, dtype=np.float32))
    progress = []
    t = FasterWhisperTranscriber("tiny", language="", download_root=tmp_path / "models").transcribe(
        tmp_path / "audio.wav", duration=4.2, on_progress=progress.append)
    _load_model.cache_clear()

    assert calls["init"] == ("tiny", "cpu", "int8", str(tmp_path / "models"))
    assert calls["kwargs"] == {"language": None, "word_timestamps": True, "vad_filter": True}
    # Decoded samples are passed in, not a path (faster-whisper's PyAV decoder is bypassed).
    assert isinstance(calls["audio"], np.ndarray) and calls["audio"].dtype == np.float32
    assert t.language == "en" and t.duration == 4.2
    assert [s.text for s in t.segments] == ["Hi there.", "Bye"]
    assert t.words[1] == Word(" there.", 0.5, 1.9, 0.877)
    assert progress == [0.5, 1.0, 1.0]


@requires_ffmpeg
def test_load_wav_16k_reads_extracted_audio(tmp_path, sample_video):
    wav = tmp_path / "audio.wav"
    ffmpeg.extract_audio(sample_video, wav)
    audio = load_wav_16k(wav, block_frames=4000)  # small blocks exercise the loop
    assert audio.dtype == np.float32
    assert len(audio) == pytest.approx(3 * 16000, abs=1600)
    assert 0.1 < np.abs(audio).max() <= 1.0  # the 440 Hz test tone


def test_load_wav_16k_rejects_other_formats(tmp_path):
    import wave
    path = tmp_path / "stereo.wav"
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2), w.setsampwidth(2), w.setframerate(44100)
        w.writeframes(b"\x00" * 400)
    with pytest.raises(ValueError, match="16 kHz mono"):
        load_wav_16k(path)


def test_real_faster_whisper_skips_pyav_decoding_for_arrays(monkeypatch):
    """Regression: faster-whisper's PyAV decoder breaks with PyAV >= 19
    ("open() got an unexpected keyword argument 'metadata_errors'").

    Calls the real ``WhisperModel.transcribe`` with the kind of array we pass and
    fails if it ever reaches ``decode_audio``. Skipped if faster-whisper isn't installed.
    """
    fw = pytest.importorskip("faster_whisper.transcribe")

    def boom(*_args, **_kwargs):
        raise AssertionError("decode_audio (PyAV) must not be called")

    monkeypatch.setattr(fw, "decode_audio", boom)
    model = fw.WhisperModel.__new__(fw.WhisperModel)  # no weights needed
    model.feature_extractor = SimpleNamespace(sampling_rate=16000)
    model.model = SimpleNamespace(is_multilingual=True)
    with pytest.raises(Exception) as excinfo:
        model.transcribe(np.zeros(16000, dtype=np.float32), word_timestamps=True, vad_filter=True)
    # It gets past audio decoding and only then fails on the missing model internals.
    assert not isinstance(excinfo.value, AssertionError)

"""Local transcription with faster-whisper (CTranslate2)."""

from functools import lru_cache
from pathlib import Path

from twapza.transcription.base import ProgressCallback, Segment, Transcript, Word


@lru_cache(maxsize=2)
def _load_model(size: str, device: str, compute_type: str, download_root: str):
    from faster_whisper import WhisperModel  # heavy import, only in the worker

    return WhisperModel(size, device=device, compute_type=compute_type, download_root=download_root)


class FasterWhisperTranscriber:
    def __init__(self, model: str, device: str = "cpu", compute_type: str = "int8",
                 language: str | None = None, download_root: Path = Path("./data/models")):
        self.model = model
        self.device = device
        self.compute_type = compute_type
        self.language = language or None
        self.download_root = Path(download_root)

    def transcribe(self, audio_path: Path, *, duration: float,
                   on_progress: ProgressCallback | None = None) -> Transcript:
        self.download_root.mkdir(parents=True, exist_ok=True)
        model = _load_model(self.model, self.device, self.compute_type, str(self.download_root))
        raw_segments, info = model.transcribe(
            str(audio_path),
            language=self.language,
            word_timestamps=True,
            vad_filter=True,
        )
        total = info.duration or duration or 1.0
        segments: list[Segment] = []
        for seg in raw_segments:  # a generator: transcription happens while iterating
            words = [
                Word(text=w.word, start=round(w.start, 3), end=round(w.end, 3),
                     probability=round(w.probability, 3))
                for w in (seg.words or [])
            ]
            segments.append(Segment(start=round(seg.start, 3), end=round(seg.end, 3),
                                    text=seg.text.strip(), words=words))
            if on_progress:
                on_progress(min(1.0, seg.end / total))
        if on_progress:
            on_progress(1.0)
        return Transcript(language=info.language, duration=duration, segments=segments)

"""Speech-to-text. Select a backend with ``TWAPZA_TRANSCRIBER``.

To add a hosted API backend, implement ``Transcriber`` (see ``base.py``) in a new
module and register it in ``get_transcriber`` below.
"""

from twapza.config import get_settings
from twapza.transcription.base import Segment, Transcriber, Transcript, Word

__all__ = ["Segment", "Transcriber", "Transcript", "Word", "get_transcriber"]


def get_transcriber() -> Transcriber:
    settings = get_settings()
    if settings.transcriber == "faster_whisper":
        from twapza.transcription.faster_whisper import FasterWhisperTranscriber

        return FasterWhisperTranscriber(
            model=settings.whisper_model,
            device=settings.whisper_device,
            compute_type=settings.whisper_compute_type,
            language=settings.whisper_language,
            download_root=settings.whisper_model_dir,
        )
    raise ValueError(f"unknown transcriber: {settings.transcriber!r}")

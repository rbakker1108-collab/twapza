"""Transcript data model and the Transcriber protocol.

Any speech-to-text backend (local faster-whisper, a hosted API, …) implements
``Transcriber`` and returns a ``Transcript`` with word-level timestamps.
"""

import json
from collections.abc import Callable
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Protocol

ProgressCallback = Callable[[float], None]


@dataclass(frozen=True)
class Word:
    text: str  # as produced by the model; may carry leading space / punctuation
    start: float
    end: float
    probability: float = 1.0


@dataclass(frozen=True)
class Segment:
    start: float
    end: float
    text: str
    words: list[Word] = field(default_factory=list)


@dataclass(frozen=True)
class Transcript:
    language: str | None
    duration: float
    segments: list[Segment]

    @property
    def words(self) -> list[Word]:
        return [w for s in self.segments for w in s.words]

    def text_between(self, start: float, end: float) -> str:
        """Words whose midpoint falls inside [start, end)."""
        picked = [w.text.strip() for w in self.words if start <= (w.start + w.end) / 2 < end]
        return " ".join(p for p in picked if p)

    def to_json(self) -> str:
        return json.dumps(asdict(self), ensure_ascii=False)

    @classmethod
    def from_json(cls, raw: str) -> "Transcript":
        data = json.loads(raw)
        return cls(
            language=data.get("language"),
            duration=float(data.get("duration", 0)),
            segments=[
                Segment(
                    start=s["start"], end=s["end"], text=s.get("text", ""),
                    words=[Word(**w) for w in s.get("words", [])],
                )
                for s in data.get("segments", [])
            ],
        )

    @classmethod
    def empty(cls, duration: float) -> "Transcript":
        return cls(language=None, duration=duration, segments=[])


class Transcriber(Protocol):
    def transcribe(self, audio_path: Path, *, duration: float,
                   on_progress: ProgressCallback | None = None) -> Transcript: ...

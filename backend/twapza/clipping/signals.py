"""Non-transcript signals used to refine AI highlights: loudness and scene changes."""

import bisect
import logging
import wave
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

import numpy as np

log = logging.getLogger(__name__)


# --- audio energy -----------------------------------------------------------------

@dataclass(frozen=True)
class EnergyProfile:
    """Loudness (dBFS) per fixed-size window of the audio track."""

    window: float
    db: np.ndarray

    def score(self, start: float, end: float) -> float:
        """0-100: how loud the clip's loudest moments are compared with the whole video.

        Uses the clip's 90th-percentile window (its peaks, robust to a single spike)
        and ranks it against all windows of the video, so a clip with shouting,
        laughter or applause scores high and a quiet stretch scores low.
        """
        if self.db.size == 0:
            return 50.0
        i0 = max(0, int(start / self.window))
        i1 = min(self.db.size, max(i0 + 1, int(np.ceil(end / self.window))))
        clip = self.db[i0:i1]
        if clip.size == 0:
            return 50.0
        peak = float(np.percentile(clip, 90))
        rank = float(np.searchsorted(np.sort(self.db), peak, side="right")) / self.db.size
        return round(100 * rank, 1)


def energy_from_samples(samples: np.ndarray, sample_rate: int, window: float = 0.5) -> EnergyProfile:
    n = max(1, int(sample_rate * window))
    usable = samples[: samples.size - samples.size % n]
    if usable.size == 0:
        return EnergyProfile(window=window, db=np.zeros(0))
    frames = usable.reshape(-1, n).astype(np.float64)
    rms = np.sqrt(np.mean(frames ** 2, axis=1))
    return EnergyProfile(window=window, db=20 * np.log10(np.maximum(rms, 1e-6)))


def energy_from_wav(path: Path, window: float = 0.5) -> EnergyProfile:
    """Loudness profile of a 16-bit mono WAV, read block by block (fine for 3-hour files)."""
    with wave.open(str(path), "rb") as wav:
        if wav.getnchannels() != 1 or wav.getsampwidth() != 2:
            raise ValueError("expected 16-bit mono WAV")
        rate = wav.getframerate()
        n = max(1, int(rate * window))
        block_frames = n * 120  # one minute at 0.5 s windows
        parts: list[np.ndarray] = []
        leftover = np.zeros(0, dtype=np.float32)
        while True:
            raw = wav.readframes(block_frames)
            if not raw:
                break
            samples = np.concatenate([leftover, np.frombuffer(raw, dtype="<i2") / 32768.0])
            whole = samples.size - samples.size % n
            parts.append(energy_from_samples(samples[:whole], rate, window).db)
            leftover = samples[whole:]
    return EnergyProfile(window=window, db=np.concatenate(parts) if parts else np.zeros(0))


# --- scene changes ----------------------------------------------------------------

def detect_scene_cuts(video_path: Path, *, duration: float | None = None,
                      on_progress: Callable[[float], None] | None = None,
                      segment_seconds: float = 120) -> list[float]:
    """Times (s) of hard cuts, found with PySceneDetect's ContentDetector.

    Run on the 720p proxy for speed. Processed in segments so progress can be reported.
    """
    from scenedetect import ContentDetector, SceneManager, open_video

    video = open_video(str(video_path))
    manager = SceneManager()
    manager.auto_downscale = True
    manager.add_detector(ContentDetector())
    total = duration or (video.duration.seconds if video.duration else 0) or 1.0
    while manager.detect_scenes(video=video, duration=segment_seconds) > 0:
        if on_progress:
            on_progress(min(1.0, video.position.seconds / total))
    if on_progress:
        on_progress(1.0)
    return [round(cut.seconds, 3) for cut in manager.get_cut_list(show_warning=False)]


def nearest(times: Sequence[float], t: float) -> float | None:
    """Closest value in sorted ``times`` to ``t``."""
    if not times:
        return None
    i = bisect.bisect_left(times, t)
    options = [times[j] for j in (i - 1, i) if 0 <= j < len(times)]
    return min(options, key=lambda x: abs(x - t))

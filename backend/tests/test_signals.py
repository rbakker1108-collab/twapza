import subprocess
import wave

import numpy as np
import pytest

from tests.conftest import requires_ffmpeg
from twapza.clipping.signals import (
    detect_scene_cuts, energy_from_samples, energy_from_wav, nearest,
)

SR = 16000


def tone(seconds, amplitude):
    t = np.arange(int(SR * seconds)) / SR
    return (amplitude * np.sin(2 * np.pi * 220 * t)).astype(np.float32)


def test_energy_profile_and_score_ranks_loud_clips_higher():
    # 0-20s quiet, 20-30s loud (e.g. laughter/applause), 30-60s quiet
    audio = np.concatenate([tone(20, 0.05), tone(10, 0.8), tone(30, 0.05)])
    profile = energy_from_samples(audio, SR, window=0.5)
    assert profile.db.size == 120
    loud, quiet = profile.score(18, 35), profile.score(35, 55)
    assert loud > 90 and quiet < 90 and loud > quiet
    assert 0 <= quiet <= 100


def test_energy_score_edge_cases():
    profile = energy_from_samples(tone(10, 0.1), SR)
    assert profile.score(100, 120) == 50.0  # outside the audio
    empty = energy_from_samples(np.zeros(10, dtype=np.float32), SR)
    assert empty.db.size == 0 and empty.score(0, 5) == 50.0


def test_energy_from_wav_matches_in_memory(tmp_path):
    audio = np.concatenate([tone(7.3, 0.1), tone(5, 0.6)])  # not a whole number of blocks
    path = tmp_path / "a.wav"
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(SR)
        w.writeframes((audio * 32767).astype("<i2").tobytes())
    from_file = energy_from_wav(path, window=0.5)
    in_memory = energy_from_samples(audio, SR, window=0.5)
    assert from_file.db.size == in_memory.db.size == 24
    assert np.allclose(from_file.db, in_memory.db, atol=0.01)


def test_nearest():
    assert nearest([], 3) is None
    assert nearest([1.0, 5.0, 9.0], 6.5) == 5.0
    assert nearest([1.0, 5.0, 9.0], 7.5) == 9.0
    assert nearest([1.0], 100) == 1.0


@requires_ffmpeg
def test_detects_hard_cuts(tmp_path):
    pytest.importorskip("scenedetect")
    video = tmp_path / "cuts.mp4"
    # red 0-3s, blue 3-6s, white 6-9s
    subprocess.run([
        "ffmpeg", "-v", "error", "-y",
        "-f", "lavfi", "-i", "color=red:size=320x180:d=3:r=25",
        "-f", "lavfi", "-i", "color=blue:size=320x180:d=3:r=25",
        "-f", "lavfi", "-i", "color=white:size=320x180:d=3:r=25",
        "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0", "-c:v", "libx264", "-preset", "ultrafast",
        "-pix_fmt", "yuv420p", str(video)], check=True)
    seen = []
    cuts = detect_scene_cuts(video, duration=9, on_progress=seen.append, segment_seconds=2)
    assert len(cuts) == 2
    assert cuts[0] == pytest.approx(3, abs=0.1) and cuts[1] == pytest.approx(6, abs=0.1)
    assert seen[-1] == 1.0 and len(seen) > 2

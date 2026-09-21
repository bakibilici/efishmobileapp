"""Synthesizes AKBA's listening earcons, so no third-party sound asset is needed.

    python3 scripts/sounds/make_earcons.py

Writes assets/audio/akba-listen-start.wav (AKBA starts listening) and
assets/audio/akba-listen-end.wav (AKBA stops listening). Both are built from
scratch: two FM "glass" tones a fifth apart, a short rising pitch glide into
each, and a breath of band-passed noise that sweeps upward. No low end, since
road noise masks it. The start sound rises (G5 then D6) and stays short
(0.4 s) so it never delays the driver; the end sound falls and is quieter.
"""
import wave
from pathlib import Path

import numpy as np

RATE = 44100
OUT = Path(__file__).resolve().parents[2] / "assets" / "audio"


def envelope(n: int, attack: float, tau: float) -> np.ndarray:
    t = np.arange(n) / RATE
    a = np.minimum(1.0, t / attack)
    a = 0.5 - 0.5 * np.cos(np.pi * a)  # raised-cosine attack, no click
    return a * np.exp(-np.maximum(0.0, t - attack) / tau)


def glass_tone(freq: float, dur: float, tau: float, glide_cents: float) -> np.ndarray:
    """An FM bell: brightness decays faster than loudness, with an inharmonic shimmer."""
    n = int(dur * RATE)
    t = np.arange(n) / RATE
    # Glide into the note from `glide_cents` below over the first 40 ms.
    cents = glide_cents * np.exp(-t / 0.012)
    f = freq * 2 ** (-cents / 1200)
    phase = 2 * np.pi * np.cumsum(f) / RATE
    index = 1.1 * np.exp(-t / 0.07) + 0.12
    body = np.sin(phase + index * np.sin(2 * phase))
    shimmer = 0.16 * np.sin(2.76 * phase) * np.exp(-t / 0.05)
    return (body + shimmer) * envelope(n, 0.006, tau)


def air(dur: float, f_start: float, f_end: float, level: float, seed: int) -> np.ndarray:
    """Noise through a resonant band-pass whose centre sweeps from f_start to f_end."""
    n = int(dur * RATE)
    rng = np.random.default_rng(seed)
    x = rng.standard_normal(n)
    y = np.zeros(n)
    y1 = y2 = 0.0
    q = 6.0
    for i in range(n):
        fc = f_start * (f_end / f_start) ** (i / n)
        w = 2 * np.pi * fc / RATE
        alpha = np.sin(w) / (2 * q)
        b0, a0, a1, a2 = alpha, 1 + alpha, -2 * np.cos(w), 1 - alpha
        out = (b0 * x[i] - b0 * (x[i - 2] if i >= 2 else 0.0) - a1 * y1 - a2 * y2) / a0
        y2, y1 = y1, out
        y[i] = out
    y /= np.max(np.abs(y)) + 1e-9
    return level * y * envelope(n, 0.03, dur / 3)


def place(total: np.ndarray, part: np.ndarray, at: float) -> None:
    i = int(at * RATE)
    end = min(len(total), i + len(part))
    total[i:end] += part[: end - i]


def finish(x: np.ndarray, peak_db: float) -> np.ndarray:
    fade = int(0.04 * RATE)
    x[-fade:] *= np.linspace(1.0, 0.0, fade)
    return x / np.max(np.abs(x)) * 10 ** (peak_db / 20)


def listen_start() -> np.ndarray:
    x = np.zeros(int(0.4 * RATE))
    place(x, 0.55 * glass_tone(783.99, 0.36, 0.1, 45), 0.0)  # G5
    place(x, 0.62 * glass_tone(1174.66, 0.33, 0.13, 45), 0.06)  # D6
    place(x, air(0.2, 1400, 7200, 0.16, seed=7), 0.0)
    return finish(x, -6.0)


def listen_end() -> np.ndarray:
    x = np.zeros(int(0.34 * RATE))
    place(x, 0.55 * glass_tone(1174.66, 0.3, 0.08, -30), 0.0)  # D6
    place(x, 0.5 * glass_tone(783.99, 0.28, 0.1, -30), 0.055)  # G5
    place(x, air(0.14, 5200, 1600, 0.08, seed=11), 0.0)
    return finish(x, -9.0)


def write(name: str, x: np.ndarray) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(x * 32767, -32768, 32767).astype("<i2")
    with wave.open(str(OUT / name), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(RATE)
        f.writeframes(pcm.tobytes())
    print(f"{OUT / name}  {len(x) / RATE:.2f} s")


if __name__ == "__main__":
    write("akba-listen-start.wav", listen_start())
    write("akba-listen-end.wav", listen_end())

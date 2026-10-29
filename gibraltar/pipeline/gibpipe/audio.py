"""Procedurally synthesised ambient loops for the Unreal project.

    python -m gibpipe.audio      -> data/audio/{sea_waves,wind,birds_day,crickets_night}.wav

Generated from noise and oscillators here, so there are no third-party audio
licences to track. Each file is a seamless 20 s mono loop at 22.05 kHz.
"""
import wave

import numpy as np
from scipy import signal

from . import config

SR = 22050
DUR = 20.0
RNG = np.random.default_rng(1704)   # deterministic: same files every run


def _loop(x, fade=1.5):
    """Make x loop seamlessly by cross-fading its tail into its head."""
    n = int(fade * SR)
    L = len(x) - n
    out = x[:L].copy()
    w = np.linspace(0, 1, n)
    # out ends at x[L-1] and wraps to out[0] == x[L]: continuous
    out[:n] = x[:n] * w + x[L:L + n] * (1 - w)
    return out


def _noise(n):
    return RNG.standard_normal(n)


def _bandpass(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfiltfilt(sos, x)


def _lowpass(x, f, order=2):
    return signal.sosfiltfilt(signal.butter(order, f, fs=SR, output="sos"), x)


def sea():
    n = int((DUR + 1.5) * SR)
    t = np.arange(n) / SR
    rumble = _lowpass(_noise(n), 400)
    hiss = _bandpass(_noise(n), 800, 5000)
    # overlapping swells with periods ~6-9 s
    env = sum(np.clip(np.sin(2 * np.pi * t / p + ph), 0, 1) ** 2 for p, ph in ((7.0, 0), (9.3, 2.1), (6.1, 4.0)))
    x = 0.8 * rumble * (0.4 + 0.6 * env / 3) + 0.25 * hiss * (env / 3) ** 1.5
    return _loop(x)


def wind():
    n = int((DUR + 1.5) * SR)
    gust = 0.5 + 0.5 * _lowpass(_noise(n), 0.3, 1) / 0.05
    gust = np.clip(0.3 + 0.7 * (gust - gust.min()) / (np.ptp(gust) + 1e-9), 0, 1)
    x = _bandpass(_noise(n), 150, 1200) * gust + 0.3 * _bandpass(_noise(n), 1500, 3500) * gust ** 2
    return _loop(x)


def birds():
    n = int((DUR + 1.5) * SR)
    x = 0.02 * _bandpass(_noise(n), 2000, 6000)
    for _ in range(26):
        start = RNG.uniform(0.2, DUR)
        notes = RNG.integers(2, 6)
        f0 = RNG.uniform(2500, 5000)
        for k in range(notes):
            d = RNG.uniform(0.05, 0.14)
            i0 = int((start + k * d * 1.4) * SR); m = int(d * SR)
            if i0 + m >= n:
                break
            tt = np.arange(m) / SR
            sweep = f0 * (1 + RNG.uniform(-0.25, 0.35) * tt / d)
            ph = 2 * np.pi * np.cumsum(sweep) / SR
            x[i0:i0 + m] += 0.25 * np.sin(ph) * np.sin(np.pi * tt / d) ** 2
    return _loop(x)


def crickets():
    n = int((DUR + 1.5) * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f, rate, ph in ((4300, 2.7, 0.0), (4650, 3.1, 0.7), (4100, 2.3, 1.9)):
        chirp_env = (np.sin(2 * np.pi * rate * t + ph) > 0.55).astype(float)
        pulses = (np.sin(2 * np.pi * 30 * t) > 0).astype(float)
        env = _lowpass(chirp_env * pulses, 300)
        x += np.sin(2 * np.pi * f * t) * env
    return _loop(x + 0.01 * _bandpass(_noise(n), 3000, 6000))


def write(path, x, peak=0.6):
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype("<i2").tobytes())


def main():
    config.AUDIO.mkdir(parents=True, exist_ok=True)
    for name, fn, peak in (("sea_waves", sea, 0.7), ("wind", wind, 0.6), ("birds_day", birds, 0.5),
                           ("crickets_night", crickets, 0.4)):
        write(config.AUDIO / f"{name}.wav", fn(), peak)
        print("wrote", config.AUDIO / f"{name}.wav")


if __name__ == "__main__":
    main()

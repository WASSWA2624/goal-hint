"""Reproduce Goal Hint's original, short payment-review chime (standard library only)."""
import math
from pathlib import Path
import struct
import wave

ROOT = Path(__file__).resolve().parents[1]
RATE = 22050
DURATION = 0.85


def main():
    targets = [ROOT / "public/sounds/payment-review-v1.wav",
               ROOT.parent / "flutter/assets/sounds/payment-review-v1.wav",
               ROOT.parent / "flutter/android/app/src/main/res/raw/payment_review_v1.wav"]
    frames = bytearray()
    for index in range(round(RATE * DURATION)):
        time = index / RATE
        value = 0.0
        for start, frequency in [(0.025, 880.0), (0.285, 1174.659)]:
            elapsed = time - start
            if 0 <= elapsed < 0.48:
                envelope = min(1, elapsed / 0.008) * math.exp(-elapsed * 10) * min(1, (0.48 - elapsed) / 0.03)
                value += 0.38 * envelope * (math.sin(2 * math.pi * frequency * elapsed)
                                          + 0.18 * math.sin(2 * math.pi * frequency * 2 * elapsed))
        frames.extend(struct.pack("<h", round(max(-1, min(1, value)) * 32767)))
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(target), "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(RATE)
            audio.writeframes(frames)
    print(f"Original chime: {DURATION}s, {targets[0].stat().st_size} bytes per WAV; {len(targets)} identical platform copies.")


if __name__ == "__main__":
    main()

from __future__ import annotations


def score_segment_confidence(source: str, translated: str) -> float:
    s = max(len(source.strip()), 1)
    t = max(len(translated.strip()), 1)
    ratio = min(s, t) / max(s, t)
    length_boost = min(1.0, s / 80.0)
    return round(min(1.0, 0.5 * ratio + 0.5 * length_boost), 3)

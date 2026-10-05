"""Emparejado canción (artista + título + duración) → mejor resultado de YouTube.

Se usa cuando el catálogo viene de una fuente con metadata oficial (Deezer) y el
audio se busca en YouTube: se acepta un candidato SOLO si coinciden título, artista
y duración; así "Hawái – Maluma" no termina siendo un cover de un canal cualquiera.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Sequence

MAX_DURATION_DIFF_S = 8
MIN_SCORE = 3.0

_BRACKETS = re.compile(r"[\(\[][^\)\]]*[\)\]]")
_DASH_TAIL = re.compile(r"\s+-\s+.*$")
_BAD_VERSION = re.compile(r"\b(live|en vivo|cover|remix|sped up|slowed|nightcore|karaoke|instrumental)\b")


def norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text or "").lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def tokens(text: str) -> set[str]:
    return {t for t in norm(text).split(" ") if len(t) > 1}


def overlap(a: set[str], b: set[str]) -> float:
    if not a:
        return 0.0
    return sum(1 for t in a if t in b) / len(a)


def base_title(title: str) -> str:
    return _DASH_TAIL.sub(" ", _BRACKETS.sub(" ", str(title or "")))


def score_candidate(want: dict[str, Any], cand: dict[str, Any]) -> float:
    """-1 si el candidato no es válido; mayor es mejor."""
    wd, cd = want.get("duration"), cand.get("duration")
    diff = abs(wd - cd) if wd and cd else None
    if diff is not None and diff > MAX_DURATION_DIFF_S:
        return -1.0

    title_score = overlap(tokens(base_title(want["title"])), tokens(base_title(cand["title"])))
    if title_score < 0.6:
        return -1.0

    cand_text = tokens(cand.get("artist", "")) | tokens(cand["title"])
    artist_score = overlap(tokens(want["artist"]), cand_text)
    if artist_score < 0.5:
        return -1.0

    score = title_score * 3 + artist_score * 2
    if diff is not None:
        score += (MAX_DURATION_DIFF_S - diff) / MAX_DURATION_DIFF_S
    channel = cand.get("artist", "") or ""
    if channel.lower().endswith(" - topic"):
        score += 1.5
    if "vevo" in channel.lower():
        score += 0.5
    if _BAD_VERSION.search(norm(cand["title"])) and not _BAD_VERSION.search(norm(want["title"])):
        score -= 2
    return score


def pick_best(want: dict[str, Any], candidates: Sequence[dict[str, Any]]) -> dict[str, Any] | None:
    best, best_score = None, -1.0
    for c in candidates:
        s = score_candidate(want, c)
        if s > best_score:
            best, best_score = c, s
    return best if best_score >= MIN_SCORE else None

"""Filtro de "solo música" para resultados de búsqueda.

Trabaja con metadata liviana (la que devuelve `--flat-playlist`): título, canal
y duración. No es infalible, pero descarta casi todo lo que no es una canción
(entrevistas, reacciones, podcasts, making-of, directos largos, shorts…) y
prioriza versiones oficiales.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Callable, Sequence, TypeVar

T = TypeVar("T")

MIN_DURATION_S = 60        # menos de 1 min: shorts/clips/intros
MAX_DURATION_S = 10 * 60   # más de 10 min: álbumes completos, mixes, entrevistas, directos

# Palabras/expresiones que casi nunca aparecen en el título de una canción.
_BLOCK_PATTERNS = [
    r"entrevista", r"interview", r"reaccion", r"reaction", r"\breacciono\b", r"\breact\b",
    r"podcast", r"behind the scenes", r"detras de camaras", r"making of", r"\bdocumental",
    r"documentary", r"tutorial", r"trailer", r"teaser", r"unboxing", r"noticias", r"\bnews\b",
    r"episodio", r"episode", r"capitulo", r"\bshorts?\b", r"#shorts", r"mix de", r"full album",
    r"album completo", r"discografia", r"compilation of", r"best of", r"mejores canciones",
    r"top \d+", r"karaoke", r"instrumental tutorial", r"how to", r"como tocar", r"clase de",
    r"rueda de prensa", r"press conference", r"se pronuncia", r"responde a", r"explica",
    r"live stream", r"\bdirecto\b.*\bhoras\b",
]
_BLOCK_RE = re.compile("|".join(_BLOCK_PATTERNS))

# Señales de calidad → ordenan primero.
_OFFICIAL_TITLE_RE = re.compile(
    r"official (music )?video|official audio|video oficial|audio oficial|visualizer|lyric video|letra oficial"
)
# Versiones menos deseables (siguen siendo música, pero van al final).
_LESS_PREFERRED_RE = re.compile(r"\blive\b|en vivo|\bcover\b|\bremix\b|sped up|slowed|nightcore|\b8d\b|reverb")


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in text if not unicodedata.combining(c))


def is_music_candidate(title: str, channel: str, duration: int | None) -> bool:
    """False si el resultado casi seguro NO es una canción."""
    if duration is None:  # transmisiones en vivo / estrenos sin duración
        return False
    if duration < MIN_DURATION_S or duration > MAX_DURATION_S:
        return False
    t = _norm(title)
    if _BLOCK_RE.search(t):
        return False
    return True


def music_score(title: str, channel: str) -> int:
    """Mayor = mejor. Se usa para ordenar de forma estable."""
    t, c = _norm(title), _norm(channel)
    score = 0
    if channel.strip().endswith(" - Topic"):
        score += 4  # canal auto-generado de YouTube Music = pista de estudio
    if "vevo" in c.replace(" ", ""):
        score += 2
    if _OFFICIAL_TITLE_RE.search(t):
        score += 2
    if _LESS_PREFERRED_RE.search(t):
        score -= 2
    return score


def filter_and_rank(
    items: Sequence[T],
    get: Callable[[T], tuple[str, str, int | None]],
) -> list[T]:
    """Descarta lo que no es música y ordena por score (estable)."""
    kept = [(i, it) for i, it in enumerate(items) if is_music_candidate(*get(it))]
    kept.sort(key=lambda p: (-music_score(*get(p[1])[:2]), p[0]))
    # Un mismo título+artista repetido (subidas duplicadas): quedarse con el mejor.
    seen: set[tuple[str, str]] = set()
    out: list[T] = []
    for _, it in kept:
        title, channel, _d = get(it)
        key = (_norm(re.sub(r"[\(\[].*?[\)\]]", "", title)).strip(), _norm(channel.replace(" - Topic", "")).strip())
        if key in seen:
            continue
        seen.add(key)
        out.append(it)
    return out

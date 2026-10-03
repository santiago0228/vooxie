"""Capa que habla con yt-dlp (proceso hijo con timeout real y killable).

No hay DRM bypass ni evasión: solo se pide a yt-dlp la metadata y la URL del
mejor formato de audio que la fuente publica de forma regular.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs, urlparse

from .music_filter import filter_and_rank

VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

# AAC/m4a primero: es lo que AVPlayer (iOS) y ExoPlayer (Android) reproducen
# sin problemas. Opus/webm se usa solo como último recurso.
AUDIO_FORMAT = "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio"


class ExtractorError(Exception):
    def __init__(self, code: str, message: str, status: int = 502):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass
class SearchItem:
    videoId: str
    title: str
    artist: str
    artworkUrl: str | None
    duration: int | None


@dataclass
class ExtractResult:
    videoId: str
    title: str
    artist: str
    artworkUrl: str | None
    duration: int | None
    streamUrl: str
    streamExpiresAt: str
    producers: list[str] = field(default_factory=list)


def _clean_artist(name: str | None) -> str:
    name = (name or "").strip()
    if name.endswith(" - Topic"):
        name = name[: -len(" - Topic")].strip()
    return name or "Desconocido"


def _best_thumbnail(info: dict[str, Any]) -> str | None:
    thumb = info.get("thumbnail")
    if isinstance(thumb, str) and thumb.startswith("https://"):
        return thumb
    thumbs = info.get("thumbnails")
    if isinstance(thumbs, list):
        candidates = [
            t for t in thumbs
            if isinstance(t, dict) and isinstance(t.get("url"), str)
            and t["url"].startswith("https://")
        ]
        if candidates:
            candidates.sort(key=lambda t: (t.get("width") or 0) * (t.get("height") or 0))
            return candidates[-1]["url"]
    return None


def _duration(value: Any) -> int | None:
    if isinstance(value, (int, float)) and value > 0:
        return int(round(value))
    return None


def parse_stream_expiry(url: str, now: float, margin_s: int, default_ttl_s: int) -> float:
    """Devuelve el epoch (s) hasta el que consideramos válida la URL.

    Las URLs de googlevideo incluyen `expire=<epoch>`. Restamos un margen para
    renovar antes de que el reproductor choque con un 403.
    """
    try:
        qs = parse_qs(urlparse(url).query)
        raw = qs.get("expire", [None])[0]
        if raw is not None:
            expire = float(raw)
            if expire > now:
                return max(now + 30, expire - margin_s)
    except (ValueError, TypeError):
        pass
    return now + default_ttl_s


def iso_utc(epoch: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(epoch))


async def _run(args: list[str], timeout_s: int) -> bytes:
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except FileNotFoundError as exc:
        raise ExtractorError("EXTRACT_FAILED", "yt-dlp no está instalado en el servicio.", 500) from exc

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout_s)
    except asyncio.TimeoutError as exc:
        proc.kill()
        await proc.wait()
        raise ExtractorError("UPSTREAM_TIMEOUT", "yt-dlp excedió el tiempo máximo.", 504) from exc

    if proc.returncode != 0:
        lowered = stderr.decode("utf-8", "replace").lower()
        if "video unavailable" in lowered or "private video" in lowered or "removed" in lowered:
            raise ExtractorError("TRACK_NOT_FOUND", "El video no está disponible.", 404)
        # No reenviamos stderr completo (puede contener rutas/URLs internas).
        raise ExtractorError("EXTRACT_FAILED", "yt-dlp no pudo resolver el recurso.", 502)
    return stdout


class Extractor:
    def __init__(self, ytdlp_bin: str, search_timeout_s: int, extract_timeout_s: int,
                 expiry_margin_s: int, default_ttl_s: int):
        self.bin = ytdlp_bin
        self.search_timeout_s = search_timeout_s
        self.extract_timeout_s = extract_timeout_s
        self.expiry_margin_s = expiry_margin_s
        self.default_ttl_s = default_ttl_s

    async def search(self, query: str, limit: int, music_only: bool = True) -> list[SearchItem]:
        # Se piden más resultados de los necesarios porque el filtro de música descarta
        # entrevistas, reacciones, directos largos, etc.
        fetch = min(limit * 3, 50) if music_only else limit
        # `--` evita que una query que empiece con "-" sea interpretada como opción.
        out = await _run(
            [self.bin, "--dump-single-json", "--flat-playlist", "--no-warnings",
             "--skip-download", "--ignore-config", "--", f"ytsearch{fetch}:{query}"],
            self.search_timeout_s,
        )
        try:
            data = json.loads(out)
        except json.JSONDecodeError as exc:
            raise ExtractorError("SEARCH_FAILED", "Respuesta inválida de yt-dlp.", 502) from exc

        entries = [
            e for e in (data.get("entries") or [])
            if isinstance(e, dict)
            and isinstance(e.get("id"), str) and VIDEO_ID_RE.match(e["id"])
            and e.get("title")
        ]
        if music_only:
            entries = filter_and_rank(
                entries,
                lambda e: (
                    str(e["title"]),
                    str(e.get("channel") or e.get("uploader") or ""),
                    _duration(e.get("duration")),
                ),
            )

        items = [
            SearchItem(
                videoId=e["id"],
                title=str(e["title"]),
                artist=_clean_artist(e.get("channel") or e.get("uploader")),
                artworkUrl=_best_thumbnail(e),
                duration=_duration(e.get("duration")),
            )
            for e in entries
        ]
        return items[:limit]

    async def extract(self, video_id: str) -> ExtractResult:
        if not VIDEO_ID_RE.match(video_id):
            raise ExtractorError("INVALID_REQUEST", "videoId inválido.", 400)
        out = await _run(
            [self.bin, "--dump-single-json", "--no-playlist", "--no-warnings",
             "--skip-download", "--ignore-config", "-f", AUDIO_FORMAT,
             "--", f"https://www.youtube.com/watch?v={video_id}"],
            self.extract_timeout_s,
        )
        try:
            info = json.loads(out)
        except json.JSONDecodeError as exc:
            raise ExtractorError("EXTRACT_FAILED", "Respuesta inválida de yt-dlp.", 502) from exc
        return self.build_result(video_id, info)

    def build_result(self, video_id: str, info: dict[str, Any]) -> ExtractResult:
        url = info.get("url")
        if not isinstance(url, str) or not url.startswith("https://"):
            # Con -f de un solo formato, `url` está en el nivel superior.
            fmts = info.get("requested_formats") or []
            url = next(
                (f.get("url") for f in fmts
                 if isinstance(f, dict) and isinstance(f.get("url"), str)),
                None,
            )
        if not isinstance(url, str) or not url.startswith("https://"):
            raise ExtractorError("STREAM_RESOLUTION_FAILED", "No se obtuvo una URL de audio.", 502)
        if info.get("vcodec") not in (None, "none") and info.get("acodec") in (None, "none"):
            raise ExtractorError("STREAM_RESOLUTION_FAILED", "El formato resuelto no contiene audio.", 502)
        if info.get("is_live"):
            raise ExtractorError("STREAM_RESOLUTION_FAILED", "Las transmisiones en vivo no son soportadas.", 422)

        title = info.get("track") or info.get("title")
        if not title:
            raise ExtractorError("EXTRACT_FAILED", "Metadata sin título.", 502)
        artist = _clean_artist(info.get("artist") or info.get("creator")
                               or info.get("channel") or info.get("uploader"))
        now = time.time()
        expires = parse_stream_expiry(url, now, self.expiry_margin_s, self.default_ttl_s)
        return ExtractResult(
            videoId=video_id,
            title=str(title),
            artist=artist,
            artworkUrl=_best_thumbnail(info),
            duration=_duration(info.get("duration")),
            streamUrl=url,
            streamExpiresAt=iso_utc(expires),
            producers=[],  # yt-dlp no expone productores de forma fiable: nunca se inventan.
        )

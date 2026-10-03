"""Configuración del microservicio (solo variables de entorno)."""
from __future__ import annotations

import os
from dataclasses import dataclass


def _int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} debe ser un entero, recibido: {raw!r}") from exc
    if value <= 0:
        raise RuntimeError(f"{name} debe ser > 0")
    return value


@dataclass(frozen=True)
class Settings:
    auth_token: str
    port: int
    search_timeout_s: int
    extract_timeout_s: int
    max_concurrency: int
    search_max_results: int
    # Margen de seguridad restado a la expiración real del stream.
    expiry_margin_s: int
    # Si la URL no declara expiración, asumimos esta vida útil conservadora.
    default_stream_ttl_s: int
    ytdlp_bin: str
    # Filtra resultados que no son música (entrevistas, reacciones, directos…).
    music_only: bool = True

    @staticmethod
    def load() -> "Settings":
        token = os.environ.get("SERVICE_AUTH_TOKEN", "").strip()
        if len(token) < 24:
            raise RuntimeError(
                "SERVICE_AUTH_TOKEN es obligatorio y debe tener al menos 24 caracteres."
            )
        return Settings(
            auth_token=token,
            port=_int("PORT", 8080),
            search_timeout_s=_int("SEARCH_TIMEOUT_S", 20),
            extract_timeout_s=_int("EXTRACT_TIMEOUT_S", 30),
            max_concurrency=_int("MAX_CONCURRENCY", 4),
            search_max_results=_int("SEARCH_MAX_RESULTS", 20),
            expiry_margin_s=_int("EXPIRY_MARGIN_S", 300),
            default_stream_ttl_s=_int("DEFAULT_STREAM_TTL_S", 3600),
            ytdlp_bin=os.environ.get("YTDLP_BIN", "yt-dlp").strip() or "yt-dlp",
            music_only=os.environ.get("MUSIC_ONLY", "true").strip().lower() not in ("0", "false", "no"),
        )

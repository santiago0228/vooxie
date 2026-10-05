"""VooXiE yt-dlp service — API HTTP autenticada.

POST /search   { "query": "..." }       -> { success, items[] }
POST /extract  { "videoId": "..." }     -> { success, ...metadata, streamUrl, streamExpiresAt, producers }
GET  /healthz                           -> { status: "ok" }
"""
from __future__ import annotations

import asyncio
import calendar
import hmac
import logging
import time
from dataclasses import asdict
from typing import Awaitable, Callable, TypeVar

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from .config import Settings
from .extractor import VIDEO_ID_RE, ExtractResult, Extractor, ExtractorError
from .match import pick_best

log = logging.getLogger("ytdlp-service")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

T = TypeVar("T")


class SearchBody(BaseModel):
    query: str = Field(min_length=1, max_length=200)

    @field_validator("query")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("query vacía")
        return v


class ExtractBody(BaseModel):
    videoId: str

    @field_validator("videoId")
    @classmethod
    def _valid(cls, v: str) -> str:
        if not VIDEO_ID_RE.match(v):
            raise ValueError("videoId inválido")
        return v


class MatchBody(BaseModel):
    artist: str = Field(min_length=1, max_length=120)
    title: str = Field(min_length=1, max_length=200)
    duration: int | None = Field(default=None, ge=1, le=7200)

    @field_validator("artist", "title")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("vacío")
        return v


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"success": False, "code": code, "message": message},
    )


def _still_valid(result: ExtractResult, margin_s: int) -> bool:
    """El stream cacheado en memoria sigue siendo útil si le queda más que el margen."""
    try:
        exp = calendar.timegm(time.strptime(result.streamExpiresAt, "%Y-%m-%dT%H:%M:%SZ"))
    except ValueError:
        return False
    return exp - time.time() > margin_s


def create_app(settings: Settings | None = None, extractor: Extractor | None = None) -> FastAPI:
    settings = settings or Settings.load()
    extractor = extractor or Extractor(
        settings.ytdlp_bin,
        settings.search_timeout_s,
        settings.extract_timeout_s,
        settings.expiry_margin_s,
        settings.default_stream_ttl_s,
        settings.cookies_file,
        settings.proxy,
        settings.extract_socket_timeout_s,
    )
    app = FastAPI(title="VooXiE yt-dlp service", docs_url=None, redoc_url=None, openapi_url=None)
    semaphore = asyncio.Semaphore(settings.max_concurrency)
    # Deduplicación: peticiones simultáneas por el mismo videoId comparten UNA extracción.
    inflight: dict[str, "asyncio.Task[ExtractResult]"] = {}
    # Caché en memoria: la misma búsqueda no vuelve a pagar el arranque de yt-dlp.
    search_cache: dict[str, tuple[float, list]] = {}
    extract_cache: dict[str, ExtractResult] = {}

    async def require_auth(request: Request) -> None:
        header = request.headers.get("authorization", "")
        scheme, _, token = header.partition(" ")
        ok = scheme.lower() == "bearer" and hmac.compare_digest(
            token.encode(), settings.auth_token.encode()
        )
        if not ok:
            raise ExtractorError("UNAUTHORIZED", "Credenciales inválidas.", 401)

    @app.exception_handler(ExtractorError)
    async def _extractor_error(_: Request, exc: ExtractorError) -> JSONResponse:
        return error_response(exc.status, exc.code, exc.message)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, __: RequestValidationError) -> JSONResponse:
        return error_response(400, "INVALID_REQUEST", "Petición inválida.")

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("Error no controlado: %s", type(exc).__name__)
        return error_response(500, "EXTRACT_FAILED", "Error interno del servicio.")

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    async def limited(factory: Callable[[], Awaitable[T]]) -> T:
        async with semaphore:
            return await factory()

    @app.post("/search", dependencies=[Depends(require_auth)])
    async def search(body: SearchBody) -> dict:
        key = body.query.lower()
        now = time.monotonic()
        hit = search_cache.get(key)
        if hit and now - hit[0] < settings.search_cache_ttl_s:
            return {"success": True, "items": [asdict(i) for i in hit[1]], "cached": True}
        try:
            items = await limited(lambda: extractor.search(body.query, settings.search_max_results, settings.music_only))
        except ExtractorError as exc:
            if exc.code == "EXTRACT_FAILED":
                raise ExtractorError("SEARCH_FAILED", "La búsqueda falló.", exc.status) from exc
            raise
        if len(search_cache) >= 500:
            search_cache.pop(next(iter(search_cache)))
        search_cache[key] = (now, items)
        return {"success": True, "items": [asdict(i) for i in items]}

    async def do_extract(vid: str) -> dict:
        cached = extract_cache.get(vid)
        if cached and _still_valid(cached, settings.expiry_margin_s):
            return {"success": True, **asdict(cached), "cached": True}
        task = inflight.get(vid)
        if task is None:
            task = asyncio.ensure_future(limited(lambda: extractor.extract(vid)))
            inflight[vid] = task
            task.add_done_callback(lambda _t, v=vid: inflight.pop(v, None))
        result = await asyncio.shield(task)
        if len(extract_cache) >= 500:
            extract_cache.pop(next(iter(extract_cache)))
        extract_cache[vid] = result
        return {"success": True, **asdict(result)}

    @app.post("/extract", dependencies=[Depends(require_auth)])
    async def extract(body: ExtractBody) -> dict:
        return await do_extract(body.videoId)

    match_cache: dict[str, str] = {}

    @app.post("/match", dependencies=[Depends(require_auth)])
    async def match(body: MatchBody) -> dict:
        """artista + título + duración → mejor video de YouTube → stream (todo en UNA llamada)."""
        key = f"{body.artist.lower()}|{body.title.lower()}|{body.duration or 0}"
        vid = match_cache.get(key)
        if vid is None:
            items = await limited(
                lambda: extractor.search(f"{body.artist} {body.title}", 10, settings.music_only)
            )
            best = pick_best(
                {"title": body.title, "artist": body.artist, "duration": body.duration},
                [{"videoId": i.videoId, "title": i.title, "artist": i.artist, "duration": i.duration} for i in items],
            )
            if best is None:
                raise ExtractorError("TRACK_NOT_FOUND", "No se encontró una versión confiable de la canción.", 404)
            vid = best["videoId"]
            if len(match_cache) >= 1000:
                match_cache.pop(next(iter(match_cache)))
            match_cache[key] = vid
        return await do_extract(vid)

    @app.post("/diag", dependencies=[Depends(require_auth)])
    async def diag() -> dict:
        """Diagnóstico para quien tiene el token: versiones, runtime JS y una extracción de prueba."""
        import importlib.util
        import shutil

        async def version(cmd: list[str]) -> str | None:
            try:
                proc = await asyncio.create_subprocess_exec(
                    *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                out, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
                return out.decode().strip().splitlines()[0] if out else None
            except Exception:  # noqa: BLE001 - diagnóstico: cualquier fallo = no disponible
                return None

        checks = {
            "yt_dlp": await version([settings.ytdlp_bin, "--version"]),
            "deno": await version(["deno", "--version"]) if shutil.which("deno") else None,
            "yt_dlp_ejs": importlib.util.find_spec("yt_dlp_ejs") is not None,
            "cookies_file": bool(settings.cookies_file),
            "proxy": bool(settings.proxy),
        }
        probe: dict = {"videoId": "dQw4w9WgXcQ"}
        try:
            r = await extractor.extract("dQw4w9WgXcQ")
            probe.update(ok=True, expiresAt=r.streamExpiresAt)
        except ExtractorError as exc:
            detail = exc.detail or ""
            low = detail.lower()
            reason = (
                "bot_blocked" if ("not a bot" in low or "sign in to confirm" in low)
                else "no_js_runtime" if "javascript runtime" in low
                else "timeout" if exc.code == "UPSTREAM_TIMEOUT"
                else "failed"
            )
            probe.update(ok=False, code=exc.code, reason=reason, detail=detail[:300])
        hints = []
        if not checks["deno"]:
            hints.append("Falta deno: reconstruye la imagen con el requirements.txt actual.")
        if not checks["yt_dlp_ejs"]:
            hints.append("Falta yt-dlp-ejs: instala yt-dlp[default].")
        if probe.get("reason") == "bot_blocked":
            hints.append("YouTube bloquea la IP del servidor: usa YTDLP_COOKIES_FILE o YTDLP_PROXY.")
        return {"success": True, "checks": checks, "probe": probe, "hints": hints}

    return app

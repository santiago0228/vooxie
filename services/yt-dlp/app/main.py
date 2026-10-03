"""VooXiE yt-dlp service — API HTTP autenticada.

POST /search   { "query": "..." }       -> { success, items[] }
POST /extract  { "videoId": "..." }     -> { success, ...metadata, streamUrl, streamExpiresAt, producers }
GET  /healthz                           -> { status: "ok" }
"""
from __future__ import annotations

import asyncio
import hmac
import logging
from dataclasses import asdict
from typing import Awaitable, Callable, TypeVar

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from .config import Settings
from .extractor import VIDEO_ID_RE, ExtractResult, Extractor, ExtractorError

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


def error_response(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"success": False, "code": code, "message": message},
    )


def create_app(settings: Settings | None = None, extractor: Extractor | None = None) -> FastAPI:
    settings = settings or Settings.load()
    extractor = extractor or Extractor(
        settings.ytdlp_bin,
        settings.search_timeout_s,
        settings.extract_timeout_s,
        settings.expiry_margin_s,
        settings.default_stream_ttl_s,
    )
    app = FastAPI(title="VooXiE yt-dlp service", docs_url=None, redoc_url=None, openapi_url=None)
    semaphore = asyncio.Semaphore(settings.max_concurrency)
    # Deduplicación: peticiones simultáneas por el mismo videoId comparten UNA extracción.
    inflight: dict[str, "asyncio.Task[ExtractResult]"] = {}

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
        try:
            items = await limited(lambda: extractor.search(body.query, settings.search_max_results, settings.music_only))
        except ExtractorError as exc:
            if exc.code == "EXTRACT_FAILED":
                raise ExtractorError("SEARCH_FAILED", "La búsqueda falló.", exc.status) from exc
            raise
        return {"success": True, "items": [asdict(i) for i in items]}

    @app.post("/extract", dependencies=[Depends(require_auth)])
    async def extract(body: ExtractBody) -> dict:
        vid = body.videoId
        task = inflight.get(vid)
        if task is None:
            task = asyncio.ensure_future(limited(lambda: extractor.extract(vid)))
            inflight[vid] = task
            task.add_done_callback(lambda _t, v=vid: inflight.pop(v, None))
        result = await asyncio.shield(task)
        return {"success": True, **asdict(result)}

    return app

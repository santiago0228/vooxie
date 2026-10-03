/**
 * youtube-proxy — lógica pura (sin globals de Deno) para poder probarla.
 *
 * Acciones (POST JSON):
 *   { "action": "search",  "query": "..." }
 *   { "action": "resolve", "videoId": "..." }
 *
 * Responsabilidades (y nada más):
 *   validar → autenticar → hablar con el microservicio yt-dlp → normalizar →
 *   actualizar caché → devolver datos limpios. NO reproduce ni guarda audio.
 */

export type ErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "TRACK_NOT_FOUND"
  | "SEARCH_FAILED"
  | "EXTRACT_FAILED"
  | "STREAM_RESOLUTION_FAILED"
  | "STREAM_EXPIRED"
  | "UPSTREAM_TIMEOUT"
  | "CACHE_ERROR";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
  TRACK_NOT_FOUND: 404,
  SEARCH_FAILED: 502,
  EXTRACT_FAILED: 502,
  STREAM_RESOLUTION_FAILED: 502,
  STREAM_EXPIRED: 502,
  UPSTREAM_TIMEOUT: 504,
  CACHE_ERROR: 500,
};

const UPSTREAM_CODES = new Set<string>([
  "TRACK_NOT_FOUND", "SEARCH_FAILED", "EXTRACT_FAILED",
  "STREAM_RESOLUTION_FAILED", "UPSTREAM_TIMEOUT", "INVALID_REQUEST",
]);

export class ProxyError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
  }
}

export type CacheRow = {
  youtube_id: string;
  title: string;
  artist: string;
  artwork_url: string | null;
  stream_url: string | null;
  duration: number | null;
  canvas_url: string | null;
  producers: string[] | null;
  stream_expires_at: string | null;
};

export interface CacheStore {
  get(videoId: string): Promise<CacheRow | null>;
  /** Inserta metadata si NO existe (nunca pisa una fila existente). */
  insertIfMissing(rows: Array<Omit<CacheRow, "stream_url" | "stream_expires_at" | "canvas_url" | "producers">>): Promise<void>;
  /** Actualiza solo stream (y rellena duración/artwork si estaban vacíos). */
  saveStream(videoId: string, patch: {
    stream_url: string;
    stream_expires_at: string;
    duration?: number | null;
    artwork_url?: string | null;
  }): Promise<void>;
}

export type ProxyConfig = {
  ytdlpUrl: string;
  ytdlpToken: string;
  allowedOrigins: string[];
  searchTimeoutMs?: number;
  extractTimeoutMs?: number;
  /** Margen: un stream que expira en menos de esto se considera vencido. */
  streamSafetyMs?: number;
  rateLimitPerMinute?: number;
};

export type Deps = {
  config: ProxyConfig;
  fetch: typeof fetch;
  store: CacheStore;
  /** Devuelve el id de usuario autenticado o null. */
  authenticate: (req: Request) => Promise<string | null>;
  now?: () => number;
  log?: (level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => void;
};

export type TrackPayload = {
  videoId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  duration: number | null;
  streamUrl: string | null;
  streamExpiresAt: string | null;
  canvasUrl: string | null;
  producers: string[];
};

export type SearchItem = {
  videoId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  duration: number | null;
};

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const MAX_QUERY = 200;

// ─── Validación de respuestas del microservicio ───────────────────────────────

const isHttps = (v: unknown): v is string => typeof v === "string" && v.startsWith("https://");
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const optHttps = (v: unknown): string | null => (isHttps(v) ? v : null);
const optDuration = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

export function parseSearchResponse(json: unknown): SearchItem[] {
  const body = json as { success?: unknown; items?: unknown };
  if (!body || body.success !== true || !Array.isArray(body.items)) {
    throw new ProxyError("SEARCH_FAILED", "Respuesta inválida del servicio de búsqueda.");
  }
  const items: SearchItem[] = [];
  for (const raw of body.items) {
    const it = raw as Record<string, unknown>;
    if (!it || typeof it.videoId !== "string" || !VIDEO_ID_RE.test(it.videoId)) continue;
    if (!isStr(it.title)) continue;
    items.push({
      videoId: it.videoId,
      title: it.title.trim(),
      artist: isStr(it.artist) ? it.artist.trim() : "Desconocido",
      artworkUrl: optHttps(it.artworkUrl),
      duration: optDuration(it.duration),
    });
  }
  return items;
}

export type Extraction = {
  videoId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  duration: number | null;
  streamUrl: string;
  streamExpiresAt: string;
};

export function parseExtractResponse(json: unknown, expectedId: string): Extraction {
  const b = json as Record<string, unknown>;
  if (!b || b.success !== true) {
    throw new ProxyError("EXTRACT_FAILED", "Respuesta inválida del extractor.");
  }
  if (b.videoId !== expectedId) {
    throw new ProxyError("EXTRACT_FAILED", "El extractor devolvió otro videoId.");
  }
  if (!isHttps(b.streamUrl)) {
    throw new ProxyError("STREAM_RESOLUTION_FAILED", "El extractor no devolvió una URL de audio válida.");
  }
  const exp = typeof b.streamExpiresAt === "string" ? Date.parse(b.streamExpiresAt) : NaN;
  if (!Number.isFinite(exp)) {
    throw new ProxyError("STREAM_RESOLUTION_FAILED", "El extractor no informó la expiración del stream.");
  }
  if (!isStr(b.title)) throw new ProxyError("EXTRACT_FAILED", "Metadata sin título.");
  return {
    videoId: expectedId,
    title: (b.title as string).trim(),
    artist: isStr(b.artist) ? (b.artist as string).trim() : "Desconocido",
    artworkUrl: optHttps(b.artworkUrl),
    duration: optDuration(b.duration),
    streamUrl: b.streamUrl,
    streamExpiresAt: new Date(exp).toISOString(),
  };
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

export function corsHeaders(req: Request, allowed: string[]): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  const origin = req.headers.get("origin");
  // Las apps nativas (React Native) no envían Origin ni usan CORS: no hace falta ACAO.
  // Solo los orígenes web explícitamente permitidos (Expo web / admin) reciben ACAO.
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
    headers["Access-Control-Max-Age"] = "600";
  }
  return headers;
}

function json(status: number, body: unknown, extra: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

function errorResponse(code: ErrorCode, message: string, extra: Record<string, string>): Response {
  return json(STATUS_BY_CODE[code], { success: false, code, message }, extra);
}

function toPayload(row: CacheRow): TrackPayload {
  return {
    videoId: row.youtube_id,
    title: row.title,
    artist: row.artist,
    artworkUrl: row.artwork_url,
    duration: row.duration,
    streamUrl: row.stream_url,
    streamExpiresAt: row.stream_expires_at,
    canvasUrl: row.canvas_url,
    producers: row.producers ?? [],
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const cfg = deps.config;
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? (() => {});
  const searchTimeout = cfg.searchTimeoutMs ?? 20_000;
  const extractTimeout = cfg.extractTimeoutMs ?? 35_000;
  const safety = cfg.streamSafetyMs ?? 60_000;
  const rateLimit = cfg.rateLimitPerMinute ?? 40;

  // Deduplicación dentro del isolate: varias peticiones por el mismo track
  // comparten una sola extracción.
  const inflight = new Map<string, Promise<TrackPayload>>();
  const searchMemo = new Map<string, { at: number; items: SearchItem[] }>();
  const buckets = new Map<string, { windowStart: number; count: number }>();

  function checkRate(userId: string): boolean {
    const t = now();
    const b = buckets.get(userId);
    if (!b || t - b.windowStart >= 60_000) {
      buckets.set(userId, { windowStart: t, count: 1 });
      if (buckets.size > 5000) buckets.clear();
      return true;
    }
    b.count += 1;
    return b.count <= rateLimit;
  }

  async function callService(path: "/search" | "/extract", body: unknown, timeoutMs: number): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await deps.fetch(`${cfg.ytdlpUrl.replace(/\/+$/, "")}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.ytdlpToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") {
        throw new ProxyError("UPSTREAM_TIMEOUT", "El servicio yt-dlp tardó demasiado.");
      }
      throw new ProxyError(
        path === "/search" ? "SEARCH_FAILED" : "EXTRACT_FAILED",
        "No se pudo contactar al servicio yt-dlp.",
      );
    } finally {
      clearTimeout(timer);
    }

    let parsed: unknown = null;
    try {
      parsed = await res.json();
    } catch {
      // cuerpo no JSON
    }
    if (!res.ok) {
      const code = (parsed as { code?: string } | null)?.code;
      if (res.status === 401 || res.status === 403) {
        // El token entre Edge Function y servicio es un error de configuración nuestro.
        log("error", "ytdlp service rechazó las credenciales");
        throw new ProxyError("EXTRACT_FAILED", "Servicio de extracción mal configurado.");
      }
      if (code && UPSTREAM_CODES.has(code)) throw new ProxyError(code as ErrorCode, "El servicio no pudo completar la operación.");
      throw new ProxyError(path === "/search" ? "SEARCH_FAILED" : "EXTRACT_FAILED", "El servicio no pudo completar la operación.");
    }
    return parsed;
  }

  async function doSearch(query: string): Promise<SearchItem[]> {
    const key = query.toLowerCase();
    const memo = searchMemo.get(key);
    if (memo && now() - memo.at < 60_000) return memo.items;

    const items = parseSearchResponse(await callService("/search", { query }, searchTimeout));

    // Guardar metadata básica (sin stream) para futuras resoluciones. Nunca pisa filas existentes.
    try {
      await deps.store.insertIfMissing(items.map((i) => ({
        youtube_id: i.videoId, title: i.title, artist: i.artist,
        artwork_url: i.artworkUrl, duration: i.duration,
      })));
    } catch (e) {
      log("warn", "CACHE_ERROR al guardar metadata de búsqueda", { err: String((e as Error)?.message) });
    }

    if (searchMemo.size >= 100) searchMemo.delete(searchMemo.keys().next().value as string);
    searchMemo.set(key, { at: now(), items });
    return items;
  }

  function streamIsValid(row: CacheRow | null): row is CacheRow {
    if (!row || !row.stream_url || !row.stream_expires_at) return false;
    const exp = Date.parse(row.stream_expires_at);
    return Number.isFinite(exp) && exp - now() > safety;
  }

  async function doResolve(videoId: string, staleStreamUrl: string | null): Promise<{ track: TrackPayload; cache: "hit" | "refreshed" | "miss" }> {
    let row: CacheRow | null;
    try {
      row = await deps.store.get(videoId);
    } catch {
      throw new ProxyError("CACHE_ERROR", "No se pudo leer la caché.");
    }
    // Si el cliente reporta que ESTA url falló, no es un hit; pero si otro ya la renovó, sí.
    if (streamIsValid(row) && row.stream_url !== staleStreamUrl) return { track: toPayload(row), cache: "hit" };

    const existing = inflight.get(videoId);
    if (existing) return { track: await existing, cache: row ? "refreshed" : "miss" };

    const work = (async (): Promise<TrackPayload> => {
      const ex = parseExtractResponse(await callService("/extract", { videoId }, extractTimeout), videoId);
      if (Date.parse(ex.streamExpiresAt) <= now()) {
        throw new ProxyError("STREAM_EXPIRED", "El extractor devolvió un stream ya vencido.");
      }
      try {
        if (!row) {
          await deps.store.insertIfMissing([{
            youtube_id: videoId, title: ex.title, artist: ex.artist,
            artwork_url: ex.artworkUrl, duration: ex.duration,
          }]);
        }
        await deps.store.saveStream(videoId, {
          stream_url: ex.streamUrl,
          stream_expires_at: ex.streamExpiresAt,
          ...(row?.duration == null && ex.duration != null ? { duration: ex.duration } : {}),
          ...(row?.artwork_url == null && ex.artworkUrl ? { artwork_url: ex.artworkUrl } : {}),
        });
      } catch {
        throw new ProxyError("CACHE_ERROR", "No se pudo guardar en la caché.");
      }
      // Metadata permanente: si ya existía (posible edición admin) se conserva la de la caché.
      return {
        videoId,
        title: row?.title ?? ex.title,
        artist: row?.artist ?? ex.artist,
        artworkUrl: row?.artwork_url ?? ex.artworkUrl,
        duration: row?.duration ?? ex.duration,
        streamUrl: ex.streamUrl,
        streamExpiresAt: ex.streamExpiresAt,
        canvasUrl: row?.canvas_url ?? null,
        producers: row?.producers ?? [],
      };
    })();

    inflight.set(videoId, work);
    try {
      return { track: await work, cache: row ? "refreshed" : "miss" };
    } finally {
      inflight.delete(videoId);
    }
  }

  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req, cfg.allowedOrigins);

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return errorResponse("INVALID_REQUEST", "Método no permitido.", cors);

    const userId = await deps.authenticate(req).catch(() => null);
    if (!userId) return errorResponse("UNAUTHORIZED", "Sesión inválida.", cors);
    if (!checkRate(userId)) return errorResponse("RATE_LIMITED", "Demasiadas solicitudes.", cors);

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not object");
      body = parsed as Record<string, unknown>;
    } catch {
      return errorResponse("INVALID_REQUEST", "El cuerpo debe ser un JSON válido.", cors);
    }

    try {
      if (body.action === "search") {
        const q = typeof body.query === "string" ? body.query.trim() : "";
        if (!q || q.length > MAX_QUERY) {
          return errorResponse("INVALID_REQUEST", `query requerida (1-${MAX_QUERY} caracteres).`, cors);
        }
        const items = await doSearch(q);
        return json(200, { success: true, items }, cors);
      }

      if (body.action === "resolve") {
        const id = typeof body.videoId === "string" ? body.videoId : "";
        if (!VIDEO_ID_RE.test(id)) return errorResponse("INVALID_REQUEST", "videoId inválido.", cors);
        const stale = typeof body.staleStreamUrl === "string" && body.staleStreamUrl.length <= 4096
          ? body.staleStreamUrl : null;
        const { track, cache } = await doResolve(id, stale);
        return json(200, { success: true, cache, track }, cors);
      }

      return errorResponse("INVALID_REQUEST", 'action debe ser "search" o "resolve".', cors);
    } catch (e) {
      if (e instanceof ProxyError) {
        log("warn", e.code, { action: String(body.action) });
        return errorResponse(e.code, e.message, cors);
      }
      log("error", "error no controlado", { err: (e as Error)?.name });
      return errorResponse("EXTRACT_FAILED", "Error interno.", cors);
    }
  };
}

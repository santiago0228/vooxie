/**
 * YOUTUBE CLIENT — único punto de contacto de la app con el pipeline de audio.
 *
 *   App ──supabase.functions.invoke──▶ Edge Function `youtube-proxy`
 *                                          └─▶ microservicio yt-dlp
 *
 * La app NUNCA habla con yt-dlp, ni con YouTube, ni conoce secretos del
 * microservicio. La URL de la función la resuelve supabase-js desde
 * EXPO_PUBLIC_SUPABASE_URL y el JWT del usuario se adjunta automáticamente.
 */

import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "../../supabase/client";
import type { ExternalErrorCode } from "../types";
import type {
  YouTubeProxyErrorCode,
  YouTubeProxyRequest,
  YouTubeResolveResponse,
  YouTubeSearchResponse,
} from "./types";

const FUNCTION_NAME = "youtube-proxy";
/** Debe ser > timeouts de la función (emparejar 60s) + margen de red. */
const REQUEST_TIMEOUT_MS = 75_000;

// ─── Error tipado ─────────────────────────────────────────────────────────────

export class YouTubeError extends Error {
  code: ExternalErrorCode;
  /** Código estructurado del backend, si lo hubo. */
  proxyCode?: YouTubeProxyErrorCode;

  constructor(message: string, code: ExternalErrorCode, proxyCode?: YouTubeProxyErrorCode) {
    super(message);
    this.name = "YouTubeError";
    this.code = code;
    this.proxyCode = proxyCode;
  }
}

const CODE_MAP: Record<YouTubeProxyErrorCode, { ext: ExternalErrorCode; msg: string }> = {
  INVALID_REQUEST: { ext: "invalid_response", msg: "Solicitud inválida." },
  UNAUTHORIZED: { ext: "auth_error", msg: "Debes iniciar sesión en VOOXIE para usar YouTube." },
  RATE_LIMITED: { ext: "rate_limited", msg: "Demasiadas solicitudes. Intenta en un momento." },
  TRACK_NOT_FOUND: { ext: "not_found", msg: "La canción no está disponible." },
  SEARCH_FAILED: { ext: "unavailable", msg: "La búsqueda de YouTube falló." },
  EXTRACT_FAILED: { ext: "stream_failed", msg: "No se pudo obtener el audio." },
  STREAM_RESOLUTION_FAILED: { ext: "stream_failed", msg: "No se pudo resolver el stream de audio." },
  STREAM_EXPIRED: { ext: "stream_failed", msg: "El stream expiró; reintenta." },
  UPSTREAM_TIMEOUT: { ext: "timeout", msg: "El servicio de audio tardó demasiado." },
  CACHE_ERROR: { ext: "proxy_error", msg: "Error interno de caché." },
};

function isProxyCode(v: unknown): v is YouTubeProxyErrorCode {
  return typeof v === "string" && v in CODE_MAP;
}

function fromProxyCode(code: YouTubeProxyErrorCode): YouTubeError {
  const m = CODE_MAP[code];
  return new YouTubeError(m.msg, m.ext, code);
}

// ─── Sesión ───────────────────────────────────────────────────────────────────

async function requireSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new YouTubeError("No se pudo obtener la sesión de Supabase.", "auth_error");
  if (!data.session?.access_token) {
    throw new YouTubeError("Debes iniciar sesión en VOOXIE para usar YouTube.", "auth_error", "UNAUTHORIZED");
  }
}

// ─── Invocación ───────────────────────────────────────────────────────────────

async function readErrorBody(error: FunctionsHttpError): Promise<YouTubeError> {
  try {
    const body: unknown = await error.context.json();
    const code = (body as { code?: unknown } | null)?.code;
    if (isProxyCode(code)) return fromProxyCode(code);
  } catch {
    // cuerpo no JSON
  }
  const status = (error.context as Response).status;
  if (status === 401 || status === 403) return fromProxyCode("UNAUTHORIZED");
  if (status === 429) return fromProxyCode("RATE_LIMITED");
  if (status === 504) return fromProxyCode("UPSTREAM_TIMEOUT");
  return new YouTubeError("El servicio de YouTube no está disponible.", "proxy_error");
}

export async function callProxy(
  request: Extract<YouTubeProxyRequest, { action: "search" }>,
): Promise<YouTubeSearchResponse>;
export async function callProxy(
  request: Extract<YouTubeProxyRequest, { action: "resolve" | "resolve_match" }>,
): Promise<YouTubeResolveResponse>;
export async function callProxy(
  request: YouTubeProxyRequest,
): Promise<YouTubeSearchResponse | YouTubeResolveResponse> {
  await requireSession();

  const { data, error } = await supabase.functions.invoke<unknown>(FUNCTION_NAME, {
    body: request,
    timeout: REQUEST_TIMEOUT_MS,
  });

  if (error) {
    if (error instanceof FunctionsHttpError) throw await readErrorBody(error);
    if (error instanceof FunctionsRelayError) {
      throw new YouTubeError("El servicio de YouTube no está disponible.", "proxy_error");
    }
    if (error instanceof FunctionsFetchError) {
      throw new YouTubeError("Error de red al contactar el servicio de YouTube.", "network_error");
    }
    throw new YouTubeError("Error inesperado al contactar YouTube.", "network_error");
  }

  const body = data as { success?: unknown; code?: unknown } | null;
  if (!body || typeof body !== "object") {
    throw new YouTubeError("Respuesta inválida del servicio de YouTube.", "invalid_response");
  }
  if (body.success !== true) {
    throw isProxyCode(body.code)
      ? fromProxyCode(body.code)
      : new YouTubeError("Respuesta inválida del servicio de YouTube.", "invalid_response");
  }
  return body as unknown as YouTubeSearchResponse | YouTubeResolveResponse;
}

/**
 * AUDIUS CLIENT
 *
 * Responsabilidades:
 * 1. Seleccionar un nodo activo de la red Audius (host discovery).
 * 2. Proveer un fetch wrapper con timeout, retries y manejo de errores.
 * 3. Mantener el host en memoria para no re-seleccionarlo en cada request.
 *
 * Audius es una red descentralizada: no hay un único servidor.
 * El proceso correcto es:
 *   a) GET https://api.audius.co → lista de hosts disponibles
 *   b) Elegir el primero (o hacer health check) y cachearlo
 *   c) Todas las requests van al host elegido
 *   d) Si el host falla, re-seleccionar
 *
 * No requiere API key. El parámetro `app_name` identifica la aplicación
 * en los logs de Audius — es una buena práctica, no un requisito técnico.
 */

import type { ExternalErrorCode } from "../types";

// ─── Configuración ─────────────────────────────────────────────────────────────

const AUDIUS_HOST_REGISTRY = "https://api.audius.co";
const APP_NAME = "VOOXIE";
const REQUEST_TIMEOUT_MS = 10_000;   // 10 segundos
const HOST_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// ─── Estado del cliente (módulo-level, singleton) ──────────────────────────────

let cachedHost: string | null = null;
let hostCachedAt: number | null = null;
let hostDiscoveryPromise: Promise<string> | null = null;

// ─── Error tipado ──────────────────────────────────────────────────────────────

export class AudiusError extends Error {
  code: ExternalErrorCode;
  constructor(message: string, code: ExternalErrorCode) {
    super(message);
    this.name = "AudiusError";
    this.code = code;
  }
}

// ─── Host discovery ────────────────────────────────────────────────────────────

/**
 * Obtiene la lista de hosts disponibles del registro de Audius y
 * retorna el primero. Si falla, lanza AudiusError con code "unavailable".
 *
 * La promesa se comparte (hostDiscoveryPromise) para evitar que múltiples
 * llamadas simultáneas hagan la misma petición al registry.
 */
async function discoverHost(): Promise<string> {
  // Devolver caché si es reciente
  if (cachedHost && hostCachedAt && Date.now() - hostCachedAt < HOST_CACHE_TTL_MS) {
    return cachedHost;
  }

  // Compartir la promesa de discovery en curso
  if (hostDiscoveryPromise) return hostDiscoveryPromise;

  hostDiscoveryPromise = (async () => {
    try {
      const response = await fetchWithTimeout(AUDIUS_HOST_REGISTRY, {}, 8_000);
      const json = await response.json();

      // El registry retorna: { "data": ["https://host1.audius.co", ...] }
      const hosts: string[] = json?.data ?? [];
      if (!hosts.length) {
        throw new AudiusError(
          "No hay nodos de Audius disponibles.",
          "unavailable"
        );
      }

      const host = hosts[0].replace(/\/$/, ""); // quitar trailing slash
      cachedHost = host;
      hostCachedAt = Date.now();
      return host;
    } catch (e) {
      if (e instanceof AudiusError) throw e;
      throw new AudiusError(
        "No se pudo conectar al registro de Audius.",
        "network_error"
      );
    } finally {
      hostDiscoveryPromise = null;
    }
  })();

  return hostDiscoveryPromise;
}

/** Fuerza la re-selección de host en el próximo request (llamar si el host actual falla). */
export function invalidateAudiusHost(): void {
  cachedHost = null;
  hostCachedAt = null;
  hostDiscoveryPromise = null;
}

// ─── Fetch con timeout ─────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new AudiusError(
        "La petición a Audius tardó demasiado (timeout).",
        "network_error"
      );
    }
    throw new AudiusError(
      "Error de red al conectar con Audius.",
      "network_error"
    );
  } finally {
    clearTimeout(timer);
  }
}

// ─── API fetch principal ───────────────────────────────────────────────────────

/**
 * Hace un GET al endpoint de Audius.
 * - Descubre el host si no hay uno cacheado.
 * - Agrega `app_name` automáticamente a todos los requests.
 * - Si el host retorna 5xx, invalida el caché y reintenta una vez con un nuevo host.
 * - Lanza `AudiusError` en caso de fallo.
 *
 * @param path   Ruta sin host, ej: "/v1/tracks/search"
 * @param params Query params adicionales (sin app_name, se agrega automáticamente)
 */
export async function audiusFetch<T>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const makeUrl = (host: string): string => {
    const url = new URL(`${host}${path}`);
    url.searchParams.set("app_name", APP_NAME);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }
    return url.toString();
  };

  let host: string;
  try {
    host = await discoverHost();
  } catch (e) {
    if (e instanceof AudiusError) throw e;
    throw new AudiusError("No se pudo seleccionar un nodo de Audius.", "unavailable");
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(makeUrl(host));
  } catch (e) {
    // Si hay error de red con el host actual, invalidamos y reintentamos una vez
    if (e instanceof AudiusError && e.code === "network_error") {
      invalidateAudiusHost();
      try {
        host = await discoverHost();
        response = await fetchWithTimeout(makeUrl(host));
      } catch {
        throw new AudiusError("Audius no está disponible en este momento.", "unavailable");
      }
    } else {
      throw e;
    }
  }

  // 5xx → invalidar host y reintentar
  if (response.status >= 500) {
    invalidateAudiusHost();
    try {
      host = await discoverHost();
      response = await fetchWithTimeout(makeUrl(host));
    } catch {
      throw new AudiusError("Audius no está disponible en este momento.", "unavailable");
    }
  }

  if (response.status === 404) {
    throw new AudiusError("El recurso de Audius no fue encontrado.", "not_found");
  }

  if (response.status === 429) {
    throw new AudiusError("Demasiadas peticiones a Audius. Espera un momento.", "rate_limited");
  }

  if (!response.ok) {
    throw new AudiusError(
      `Error inesperado de Audius (HTTP ${response.status}).`,
      "invalid_response"
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new AudiusError("La respuesta de Audius no es JSON válido.", "invalid_response");
  }

  return json as T;
}

/**
 * Construye la URL de stream para un track de Audius.
 * El stream es un redirect (302) a la URL de audio real.
 * expo-audio sigue redirects automáticamente, así que esta URL se puede
 * pasar directamente como `audio_url` al reproductor.
 *
 * Se exporta separada porque en algunos casos se necesita la URL antes
 * de reproducir (para pre-cargar o para guardar en el ExternalTrack).
 */
export async function buildAudiusStreamUrl(trackId: string): Promise<string> {
  const host = await discoverHost();
  return `${host}/v1/tracks/${trackId}/stream?app_name=${APP_NAME}`;
}

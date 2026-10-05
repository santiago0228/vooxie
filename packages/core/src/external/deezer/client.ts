/**
 * Cliente mínimo de la API pública de Deezer (sin autenticación) para metadata de catálogo:
 * título, artista, portada, álbum, duración. NO se usa para reproducir (solo existen previews):
 * el audio se empareja en YouTube con `resolve_match`.
 *
 * Caché en memoria con TTL + deduplicación de peticiones iguales en vuelo.
 */

const BASE = "https://api.deezer.com";
const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 8_000;

export class DeezerClientError extends Error {
  constructor(message: string, public code: "network" | "timeout" | "api" | "bad_response") {
    super(message);
    this.name = "DeezerClientError";
  }
}

type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

let fetcher: Fetcher = (url, init) => fetch(url, init) as ReturnType<Fetcher>;
const cache = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

/** Solo para pruebas. */
export function __setDeezerFetch(f: Fetcher | null): void {
  fetcher = f ?? ((url, init) => fetch(url, init) as ReturnType<Fetcher>);
  cache.clear();
  inflight.clear();
}

export function deezerUrl(path: string, params: Record<string, string | number> = {}): string {
  const qs = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return `${BASE}${path}${qs ? `?${qs}` : ""}`;
}

export async function deezerGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = deezerUrl(path, params);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;

  const work = (async (): Promise<T> => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      let res;
      try {
        res = await fetcher(url, { signal: ctl.signal });
      } catch (e) {
        if ((e as { name?: string })?.name === "AbortError") throw new DeezerClientError("Deezer tardó demasiado.", "timeout");
        throw new DeezerClientError("No se pudo conectar con Deezer.", "network");
      }
      if (!res.ok) throw new DeezerClientError(`Deezer respondió ${res.status}.`, "api");
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new DeezerClientError("Respuesta inválida de Deezer.", "bad_response");
      }
      // Deezer devuelve errores con HTTP 200 y { error: { code, message } }.
      if (body && typeof body === "object" && "error" in body) {
        throw new DeezerClientError("Deezer rechazó la petición.", "api");
      }
      if (cache.size > 300) cache.delete(cache.keys().next().value as string);
      cache.set(url, { at: Date.now(), data: body });
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  })();

  inflight.set(url, work);
  const clear = () => inflight.delete(url);
  work.then(clear, clear);
  return work;
}

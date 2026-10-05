/**
 * Cliente mínimo de la API pública de Deezer (sin autenticación).
 * Límite documentado por terceros: ~50 peticiones / 5 s → espaciamos las llamadas.
 * Deezer devuelve errores con HTTP 200 y cuerpo { error: { code, message } }.
 */
const BASE = "https://api.deezer.com";

export class DeezerError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DeezerError";
    this.code = code;
  }
}

export function createDeezerClient({
  fetchImpl = fetch,
  minIntervalMs = 120,
  maxRetries = 4,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  log = () => {},
} = {}) {
  let last = 0;

  async function getJson(pathOrUrl) {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}${pathOrUrl}`;
    for (let attempt = 0; ; attempt++) {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();

      let res;
      try {
        res = await fetchImpl(url, { headers: { Accept: "application/json" } });
      } catch (e) {
        if (attempt >= maxRetries) throw new DeezerError(`Red: ${e.message}`, "NETWORK");
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= maxRetries) throw new DeezerError(`HTTP ${res.status}`, "HTTP");
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      let body;
      try {
        body = await res.json();
      } catch {
        throw new DeezerError("Respuesta no JSON", "BAD_JSON");
      }
      if (body && body.error) {
        const code = body.error.code;
        // 4 = cuota excedida, 700 = servicio ocupado → reintentar con espera.
        if ((code === 4 || code === 700) && attempt < maxRetries) {
          log(`Deezer pidió esperar (código ${code}); reintentando…`);
          await sleep(2000 * 2 ** attempt);
          continue;
        }
        throw new DeezerError(body.error.message || "Error de Deezer", code);
      }
      return body;
    }
  }

  async function paginate(path, { max = 500 } = {}) {
    const out = [];
    let next = `${path}${path.includes("?") ? "&" : "?"}limit=100`;
    while (next && out.length < max) {
      const page = await getJson(next);
      out.push(...(page.data ?? []));
      next = page.next ?? null;
    }
    return out.slice(0, max);
  }

  return {
    getJson,
    async searchArtists(name) {
      const r = await getJson(`/search/artist?q=${encodeURIComponent(name)}&limit=10`);
      return r.data ?? [];
    },
    getArtist: (id) => getJson(`/artist/${id}`),
    getArtistAlbums: (id, max) => paginate(`/artist/${id}/albums`, { max }),
    getArtistTop: (id, limit = 100) => getJson(`/artist/${id}/top?limit=${limit}`).then((r) => r.data ?? []),
    getAlbum: (id) => getJson(`/album/${id}`),
    getTrack: (id) => getJson(`/track/${id}`),
  };
}

/** Matcher: Deezer track → youtube_id usando el servicio yt-dlp (POST /search). */
import { pickBest } from "./match.mjs";

export function createYtdlpMatcher({ baseUrl, token, fetchImpl = fetch, timeoutMs = 30000, log = () => {} }) {
  const cache = new Map();
  const root = baseUrl.replace(/\/+$/, "");

  async function search(query) {
    if (cache.has(query)) return cache.get(query);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${root}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: query.slice(0, 200) }),
        signal: ctl.signal,
      });
      if (res.status === 401) throw new Error("El servicio yt-dlp rechazó el token (revisa YTDLP_SERVICE_TOKEN).");
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.success) {
        log(`  búsqueda yt-dlp falló (${body?.code ?? res.status})`);
        return [];
      }
      cache.set(query, body.items ?? []);
      return body.items ?? [];
    } catch (e) {
      if (e.name === "AbortError") { log("  búsqueda yt-dlp: timeout"); return []; }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    /** want: { title, artist, duration } → { videoId } | null */
    async find(want) {
      const items = await search(`${want.artist} ${want.title}`);
      const best = pickBest(want, items.map((i) => ({ ...i, duration: i.duration })));
      return best ? { videoId: best.videoId } : null;
    },
  };
}

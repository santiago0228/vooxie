/**
 * Búsqueda de catálogo vía Deezer: canciones "profesionales" (título, artista, portada y
 * álbum oficiales), artistas y álbumes. Sustituye a los videos sueltos de YouTube como
 * resultado principal; el audio se empareja con YouTube al reproducir.
 */
import type { ExternalAlbum, ExternalArtist, ExternalResult, ExternalSearchResults, ExternalTrack } from "../types";
import { DeezerClientError, deezerGet } from "./client";
import { mapDeezerAlbum, mapDeezerArtist, mapDeezerTrack, trackKey } from "./mapper";

type Page = { data?: unknown[] };

function toError(e: unknown): { ok: false; message: string; code: "network_error" | "timeout" | "unavailable" } {
  if (e instanceof DeezerClientError) {
    return {
      ok: false,
      message: e.message,
      code: e.code === "timeout" ? "timeout" : e.code === "network" ? "network_error" : "unavailable",
    };
  }
  return { ok: false, message: "Error inesperado al buscar.", code: "network_error" };
}

/** Quita duplicados (misma canción/artista en varias ediciones) conservando el orden de relevancia. */
export function dedupeTracks(tracks: ExternalTrack[]): ExternalTrack[] {
  const seen = new Set<string>();
  const out: ExternalTrack[] = [];
  for (const t of tracks) {
    const k = trackKey(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

export async function searchDeezer(
  query: string,
  limit = 12,
): Promise<ExternalResult<ExternalSearchResults>> {
  const q = query.trim().slice(0, 100);
  if (!q) return { ok: true, data: { source: "youtube", tracks: [], artists: [], albums: [] } };

  const [tracksRes, artistsRes, albumsRes] = await Promise.allSettled([
    deezerGet<Page>("/search/track", { q, limit: Math.min(limit * 2, 40) }),
    deezerGet<Page>("/search/artist", { q, limit: 5 }),
    deezerGet<Page>("/search/album", { q, limit: 6 }),
  ]);

  if (tracksRes.status === "rejected" && artistsRes.status === "rejected" && albumsRes.status === "rejected") {
    return toError(tracksRes.reason);
  }

  const tracks =
    tracksRes.status === "fulfilled"
      ? dedupeTracks((tracksRes.value.data ?? []).map(mapDeezerTrack).filter((t): t is ExternalTrack => t !== null)).slice(0, limit)
      : [];
  const artists =
    artistsRes.status === "fulfilled"
      ? (artistsRes.value.data ?? []).map(mapDeezerArtist).filter((a): a is ExternalArtist => a !== null)
      : [];
  const albums =
    albumsRes.status === "fulfilled"
      ? (albumsRes.value.data ?? []).map(mapDeezerAlbum).filter((a): a is ExternalAlbum => a !== null)
      : [];

  return { ok: true, data: { source: "youtube", tracks, artists, albums } };
}

/**
 * Filtro de popularidad para Audius.
 *
 * Audius es abierto: cualquiera sube cualquier cosa, y su búsqueda por texto devuelve
 * muchísimos temas genéricos con pocas reproducciones. Aquí solo se dejan los que de
 * verdad se escuchan, ordenados por reproducciones.
 */
import type { ExternalArtist, ExternalTrack } from "../types";

/** Reproducciones mínimas para considerar un tema "popular". */
export const MIN_TRACK_PLAYS = 20_000;
/** Umbral menor si el título o el artista coinciden claramente con lo buscado. */
export const MIN_TRACK_PLAYS_RELEVANT = 5_000;
export const MIN_ARTIST_FOLLOWERS = 2_000;

function norm(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function matchesQuery(query: string, ...fields: string[]): boolean {
  const q = norm(query);
  if (q.length < 3) return false;
  return fields.some((f) => {
    const n = norm(f);
    return n === q || n.startsWith(`${q} `) || n.includes(` ${q}`);
  });
}

export function popularTracks(tracks: ExternalTrack[], query: string, max: number): ExternalTrack[] {
  return tracks
    .filter((t) => {
      const plays = t.playCount ?? 0;
      if (plays >= MIN_TRACK_PLAYS) return true;
      return plays >= MIN_TRACK_PLAYS_RELEVANT && matchesQuery(query, t.title, t.artist.name);
    })
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0))
    .slice(0, max);
}

export function popularArtists(artists: ExternalArtist[], max: number): ExternalArtist[] {
  return artists
    .filter((a) => a.verified || (a.followerCount ?? 0) >= MIN_ARTIST_FOLLOWERS)
    .sort((a, b) => (b.followerCount ?? 0) - (a.followerCount ?? 0))
    .slice(0, max);
}

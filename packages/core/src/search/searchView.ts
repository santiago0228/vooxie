/**
 * Modelo de la pantalla de búsqueda (estilo Spotify): un resultado principal, canciones
 * "profesionales" primero, y secciones de artistas y álbumes. Mezcla fuentes con reglas claras:
 *
 *   catálogo oficial (Deezer) + catálogo propio (VooXiE/importado) + Audius (solo populares)
 *
 * No se muestran videos sueltos de YouTube salvo como respaldo si el catálogo no responde.
 */
import type { AlbumWithArtist, ArtistSummary, SearchResults } from "../catalog/types";
import type { ExternalAlbum, ExternalArtist, ExternalSearchResults, ExternalTrack } from "../external/types";
import { trackKey } from "../external/deezer/mapper";
import { getItemArtistName, getItemSource, getItemTitle, isExternalTrack, type PlayableItem } from "../player/PlayableItem";

export type SearchArtistRef = {
  /** Id de ruta: uuid (VooXiE) o "dz:artist:<id>" (Deezer). */
  id: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  origin: "vooxie" | "deezer";
  listeners: number | null;
};

export type SearchAlbumRef = {
  id: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  year: string | null;
  kind: "album" | "ep" | "single" | "compilation";
  origin: "vooxie" | "deezer";
};

export type SearchTop =
  | { kind: "track"; track: PlayableItem }
  | { kind: "artist"; artist: SearchArtistRef }
  | null;

export type SearchView = {
  top: SearchTop;
  tracks: PlayableItem[];
  artists: SearchArtistRef[];
  albums: SearchAlbumRef[];
};

export type SearchViewInput = {
  query: string;
  catalog: SearchResults | null;
  /** Catálogo oficial (Deezer). */
  deezer: ExternalSearchResults | null;
  /** Respaldo: resultados de YouTube si Deezer no respondió. */
  fallback: ExternalSearchResults | null;
  audius: ExternalSearchResults | null;
  maxTracks?: number;
};

export function norm(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** 0–100: qué tan bien coincide `text` con la búsqueda. */
export function textMatch(query: string, text: string): number {
  const q = norm(query);
  const t = norm(text);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.startsWith(`${q} `) || t.startsWith(q)) return 85;
  if (t.split(" ").some((w) => w.startsWith(q))) return 70;
  if (t.includes(q)) return 55;
  const qs = q.split(" ").filter(Boolean);
  if (qs.length > 1 && qs.every((w) => t.includes(w))) return 60;
  return 0;
}

function key(item: PlayableItem): string {
  return `${norm(getItemArtistName(item))}|${norm(getItemTitle(item).replace(/[\(\[][^\)\]]*[\)\]]/g, " "))}`;
}

type Scored = { item: PlayableItem; score: number };

export function buildSearchView(input: SearchViewInput): SearchView {
  const { query } = input;
  const maxTracks = input.maxTracks ?? 8;

  // ── Canciones ──────────────────────────────────────────────────────────────
  const scored: Scored[] = [];

  (input.deezer?.tracks ?? []).forEach((t, i) => {
    const m = Math.max(textMatch(query, t.title), textMatch(query, t.artist.name) * 0.9);
    scored.push({ item: t, score: m + Math.max(0, 12 - i * 0.8) });
  });

  for (const t of input.catalog?.tracks ?? []) {
    const own = !!t.audio_url; // subida por un artista de la plataforma
    const m = Math.max(textMatch(query, t.title), textMatch(query, t.artist.display_name) * 0.9);
    if (m === 0) continue;
    scored.push({ item: t, score: m + (own ? 10 : 2) });
  }

  // Respaldo (YouTube) solo si el catálogo oficial no dio nada.
  if (!(input.deezer?.tracks.length)) {
    (input.fallback?.tracks ?? []).forEach((t, i) => {
      const m = Math.max(textMatch(query, t.title), textMatch(query, t.artist.name) * 0.9);
      scored.push({ item: t, score: m + Math.max(0, 6 - i * 0.5) - 5 });
    });
  }

  // Audius: ya viene filtrado por popularidad; entra al final y con poco peso.
  for (const t of (input.audius?.tracks ?? []).slice(0, 3)) {
    const m = Math.max(textMatch(query, t.title), textMatch(query, t.artist.name) * 0.9);
    if (m === 0) continue;
    scored.push({ item: t, score: m - 15 });
  }

  scored.sort((a, b) => b.score - a.score);

  // Dedupe: la misma canción en varias fuentes → una sola; gana el audio propio y luego el catálogo oficial.
  const bestByKey = new Map<string, Scored>();
  for (const s of scored) {
    const k = key(s.item);
    const prev = bestByKey.get(k);
    if (!prev) {
      bestByKey.set(k, s);
      continue;
    }
    const preferNew =
      (!isExternalTrack(s.item) && !!s.item.audio_url && (isExternalTrack(prev.item) || !prev.item.audio_url)) ||
      (isExternalTrack(s.item) && getItemSource(s.item) === "youtube" && isExternalTrack(prev.item) &&
        s.item.deezerId != null && prev.item.deezerId == null);
    if (preferNew) bestByKey.set(k, { item: s.item, score: Math.max(s.score, prev.score) });
  }
  const tracks = [...bestByKey.values()].sort((a, b) => b.score - a.score).slice(0, maxTracks).map((s) => s.item);

  // ── Artistas ───────────────────────────────────────────────────────────────
  const artistMap = new Map<string, SearchArtistRef & { score: number }>();
  const addArtist = (a: SearchArtistRef) => {
    const k = norm(a.name);
    if (!k) return;
    const score = textMatch(query, a.name);
    if (score === 0) return;
    const prev = artistMap.get(k);
    // Si existe en VooXiE (con catálogo importado/propio) gana sobre el de Deezer.
    if (!prev || (prev.origin === "deezer" && a.origin === "vooxie")) {
      artistMap.set(k, { ...a, listeners: a.listeners ?? prev?.listeners ?? null, score });
    }
  };
  for (const a of input.catalog?.artists ?? []) addArtist(fromSummary(a));
  for (const a of input.deezer?.artists ?? []) addArtist(fromDeezerArtist(a));
  const artists = [...artistMap.values()]
    .sort((a, b) => b.score - a.score || (b.listeners ?? 0) - (a.listeners ?? 0))
    .slice(0, 4)
    .map(({ score: _s, ...rest }) => rest);

  // ── Álbumes ────────────────────────────────────────────────────────────────
  const albumMap = new Map<string, SearchAlbumRef>();
  for (const a of input.catalog?.albums ?? []) {
    const ref = fromAlbumRow(a);
    albumMap.set(`${norm(ref.title)}|${norm(ref.artistName)}`, ref);
  }
  for (const a of input.deezer?.albums ?? []) {
    const ref = fromDeezerAlbum(a);
    const k = `${norm(ref.title)}|${norm(ref.artistName)}`;
    if (!albumMap.has(k)) albumMap.set(k, ref);
  }
  const albums = [...albumMap.values()].slice(0, 4);

  // ── Resultado principal ────────────────────────────────────────────────────
  let top: SearchTop = null;
  if (artists.length && textMatch(query, artists[0].name) >= 85) top = { kind: "artist", artist: artists[0] };
  else if (tracks.length) top = { kind: "track", track: tracks[0] };
  else if (artists.length) top = { kind: "artist", artist: artists[0] };

  return { top, tracks, artists, albums };
}

function fromSummary(a: ArtistSummary): SearchArtistRef {
  return { id: a.id, name: a.display_name, avatarUrl: a.avatar_url, verified: a.verified, origin: "vooxie", listeners: null };
}
function fromDeezerArtist(a: ExternalArtist): SearchArtistRef {
  return { id: a.externalId, name: a.name, avatarUrl: a.avatarUrl, verified: false, origin: "deezer", listeners: a.followerCount };
}
function fromAlbumRow(a: AlbumWithArtist): SearchAlbumRef {
  return {
    id: a.id,
    title: a.title,
    artistName: a.artist.display_name,
    coverUrl: a.cover_url,
    year: a.release_date ? a.release_date.slice(0, 4) : null,
    kind: a.album_type,
    origin: "vooxie",
  };
}
function fromDeezerAlbum(a: ExternalAlbum): SearchAlbumRef {
  return {
    id: a.externalId,
    title: a.title,
    artistName: a.artist.name,
    coverUrl: a.artwork?.large ?? a.artwork?.thumbnail ?? null,
    year: a.releaseDate ? a.releaseDate.slice(0, 4) : null,
    kind: a.albumType ?? "album",
    origin: "deezer",
  };
}

export { trackKey };
export type { ExternalTrack };

/**
 * unifiedSearch — Motor de búsqueda unificada de VOOXIE
 *
 * FILOSOFÍA:
 * El usuario busca en VOOXIE, no "en YouTube" ni "en Audius".
 * Este módulo toma los resultados de todas las fuentes y los combina
 * en una lista única, ordenada por relevancia, sin headers de fuente.
 *
 * ARQUITECTURA:
 *   searchCatalog (Supabase)  ─┐
 *   unifiedSearch (YouTube)   ─┼→ normalizar → rankear → UnifiedResults
 *   searchAudius (limitado)   ─┘
 *
 * unifiedSearch() — parte YouTube, SOLO BÚSQUEDA (nunca extrae audio):
 *   query ─▶ caché Supabase (tracks ya conocidos)
 *              ├─ suficientes aciertos ─▶ devolver
 *              └─ pocos ─▶ youtube-proxy /search ─▶ merge ─▶ UnifiedTrack[]
 *   El audio se resuelve DESPUÉS, cuando el usuario elige una canción
 *   (resolveTrack), no por cada resultado en pantalla.
 *
 * AUDIUS LIMITADO:
 * Audius solo se usa cuando la búsqueda coincide claramente con un artista
 * conocido (nombre propio, sin palabras cortas o genéricas). Esto evita
 * mostrar artistas desconocidos de Audius por coincidencia de palabras.
 */

import type { Track } from "../catalog/types";
import type {
  ExternalResult,
  ExternalSearchResults,
  ExternalTrack,
  ExternalArtist,
  UnifiedTrack,
} from "../external/types";
import { YouTubeError } from "../external/youtube/client";
import { unifiedToExternalTrack } from "../external/youtube/mapper";
import { searchYouTubeCache, searchYouTubeRemote } from "../external/youtube/youtubeService";
import type { PlayableItem } from "../player/PlayableItem";

// ─── Búsqueda de YouTube (caché + youtube-proxy) ──────────────────────────────

const DEFAULT_LIMIT = 20;
/** Si la caché ya aporta esta cantidad de aciertos, no se consulta yt-dlp. */
const MIN_CACHE_HITS = 8;

export type UnifiedSearchOptions = { limit?: number };

/**
 * Busca canciones. Devuelve `UnifiedTrack[]` (metadata; `streamUrl` en null
 * salvo que la caché ya tenga un stream — el player igualmente lo revalida).
 *
 * Lanza `YouTubeError` solo si NO hay ningún resultado utilizable.
 */
export async function unifiedSearch(
  query: string,
  options: UnifiedSearchOptions = {},
): Promise<UnifiedTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 50));

  const cached = await searchYouTubeCache(q, limit);
  if (cached.length >= Math.min(MIN_CACHE_HITS, limit)) return cached.slice(0, limit);

  let remote: UnifiedTrack[];
  try {
    remote = await searchYouTubeRemote(q, limit);
  } catch (e) {
    if (cached.length > 0) return cached; // degradar a lo que hay en caché
    throw e;
  }

  // La versión de caché gana (puede tener Canvas/productores/edición admin).
  const byId = new Map<string, UnifiedTrack>();
  for (const t of cached) byId.set(t.id, t);
  for (const t of remote) if (!byId.has(t.id)) byId.set(t.id, t);
  return Array.from(byId.values()).slice(0, limit);
}

/** Variante para la UI actual: `ExternalSearchResults` con `ExternalTrack`. */
export async function searchYouTubeTracks(
  query: string,
  limit: number = DEFAULT_LIMIT,
): Promise<ExternalResult<ExternalSearchResults>> {
  try {
    const tracks = (await unifiedSearch(query, { limit })).map(unifiedToExternalTrack);
    return { ok: true, data: { source: "youtube", tracks, artists: [], albums: [] } };
  } catch (e) {
    if (e instanceof YouTubeError) return { ok: false, message: e.message, code: e.code };
    return { ok: false, message: "Error inesperado al buscar en YouTube.", code: "network_error" };
  }
}

// ─── Tipo de resultado unificado ───────────────────────────────────────────────

export type UnifiedResultType = "track" | "artist" | "album";

export type UnifiedResult = {
  /** ID único para React keys */
  key: string;
  type: UnifiedResultType;
  /** El item reproducible (solo para type === "track") */
  track?: PlayableItem;
  /** Para artistas/álbumes de VOOXIE */
  vooxieArtist?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    verified: boolean;
  };
  vooxieAlbum?: {
    id: string;
    title: string;
    cover_url: string | null;
    artist: { display_name: string };
  };
  /** Para artistas externos */
  externalArtist?: ExternalArtist;
  /** Score de relevancia para ordenar */
  score: number;
  /** Fuente — para lógica interna, NO para mostrar como header en UI */
  source: "vooxie" | "audius" | "youtube";
};

// ─── Scoring de relevancia ─────────────────────────────────────────────────────

function scoreTitle(query: string, title: string): number {
  const q = query.toLowerCase().trim();
  const t = title.toLowerCase().trim();

  if (t === q) return 100;                          // coincidencia exacta
  if (t.startsWith(q)) return 80;                   // empieza igual
  if (t.includes(q)) return 60;                     // contiene la query
  // coincidencia por palabras individuales
  const qWords = q.split(/\s+/);
  const matchedWords = qWords.filter((w) => t.includes(w));
  return (matchedWords.length / qWords.length) * 40;
}

function scoreArtist(query: string, artistName: string): number {
  return scoreTitle(query, artistName) * 0.7; // artista pesa menos que título
}

function scoreTrack(query: string, track: PlayableItem): number {
  const titleScore = scoreTitle(query, track.title);
  const artistName =
    "externalId" in track ? track.artist.name : track.artist.display_name;
  const artistScore = scoreArtist(query, artistName);

  // Bonus de fuente: VOOXIE nativo primero, YouTube segundo, Audius tercero
  const sourceBonus =
    !("externalId" in track) ? 15 :
    (track as ExternalTrack).source === "youtube" ? 8 : 3;

  return titleScore + artistScore + sourceBonus;
}

// ─── Heurística para Audius ────────────────────────────────────────────────────

/**
 * Determina si la query justifica buscar en Audius.
 * Audius se activa solo para queries que parecen nombres de artistas/canciones
 * (más de 4 caracteres, no palabras genéricas sueltas).
 */
export function shouldSearchAudius(query: string): boolean {
  const q = query.trim();
  if (q.length < 4) return false;
  // Palabras genéricas que no merece la pena buscar en Audius
  const generic = ["the", "de", "la", "el", "en", "con", "una", "los", "las"];
  const words = q.toLowerCase().split(/\s+/);
  if (words.every((w) => generic.includes(w))) return false;
  return true;
}

// ─── Normalización ─────────────────────────────────────────────────────────────

export function normalizeVooxieTracks(
  query: string,
  tracks: Track[]
): UnifiedResult[] {
  return tracks.map((track) => ({
    key: `vooxie-track-${track.id}`,
    type: "track" as const,
    track,
    score: scoreTrack(query, track),
    source: "vooxie" as const,
  }));
}

export function normalizeVooxieArtists(
  query: string,
  artists: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    verified: boolean;
  }[]
): UnifiedResult[] {
  return artists.map((a) => ({
    key: `vooxie-artist-${a.id}`,
    type: "artist" as const,
    vooxieArtist: a,
    // Bonus; si el nombre coincide exacto o empieza igual, el perfil sale PRIMERO
    // (mergeAndRank pone al frente a los artistas con score > 60).
    score: scoreTitle(query, a.display_name) + 20 + (scoreTitle(query, a.display_name) >= 80 ? 40 : 0),
    source: "vooxie" as const,
  }));
}

export function normalizeVooxieAlbums(
  query: string,
  albums: {
    id: string;
    title: string;
    cover_url: string | null;
    artist: { display_name: string };
  }[]
): UnifiedResult[] {
  return albums.map((al) => ({
    key: `vooxie-album-${al.id}`,
    type: "album" as const,
    vooxieAlbum: al,
    score: scoreTitle(query, al.title) + 10,
    source: "vooxie" as const,
  }));
}

export function normalizeExternalTracks(
  query: string,
  tracks: ExternalTrack[]
): UnifiedResult[] {
  return tracks.map((track) => ({
    key: `${track.source}-track-${track.externalId}`,
    type: "track" as const,
    track,
    score: scoreTrack(query, track),
    source: track.source,
  }));
}

export function normalizeExternalArtists(
  query: string,
  artists: ExternalArtist[]
): UnifiedResult[] {
  return artists.map((a) => ({
    key: `${a.source}-artist-${a.externalId}`,
    type: "artist" as const,
    externalArtist: a,
    score: scoreTitle(query, a.name) + 15,
    source: a.source,
  }));
}

// ─── Merge y ranking ───────────────────────────────────────────────────────────

/**
 * Combina resultados de todas las fuentes y los ordena por relevancia.
 * Los artistas van al inicio del grupo de alta relevancia.
 */
export function mergeAndRank(results: UnifiedResult[]): UnifiedResult[] {
  // Ordenar por score descendente
  return [...results].sort((a, b) => {
    // Los artistas con alta relevancia van primero
    if (a.type === "artist" && b.type !== "artist" && a.score > 60) return -1;
    if (b.type === "artist" && a.type !== "artist" && b.score > 60) return 1;
    return b.score - a.score;
  });
}

/**
 * Limita la cantidad de resultados por fuente para no saturar la lista.
 * Siempre incluye los mejores resultados sin importar la fuente.
 */
export function limitBySource(
  results: UnifiedResult[],
  limits: { vooxie: number; youtube: number; audius: number }
): UnifiedResult[] {
  const counts = { vooxie: 0, youtube: 0, audius: 0 };
  return results.filter((r) => {
    const src = r.source;
    if (counts[src] >= limits[src]) return false;
    counts[src]++;
    return true;
  });
}

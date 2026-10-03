import { supabase } from "../supabase/client";
import type {
  Track,
  ArtistSummary,
  ArtistDetail,
  AlbumDetail,
  AlbumWithArtist,
  SearchResults,
  Genre,
} from "./types";

const ARTIST_SUMMARY_COLUMNS = "id, display_name, avatar_url, verified";

const TRACK_SELECT = `
  *,
  artist:artist_profiles ( ${ARTIST_SUMMARY_COLUMNS} ),
  album:albums ( cover_url ),
  track_genres ( genre:genres ( id, name ) )
`;

/**
 * Todas las queries de tracks pasan por esto — mismo shape en Inicio,
 * Descubrir, artista, álbum y favoritos. Resuelve la portada (propia del
 * track, si no la del álbum) acá una sola vez, no en cada pantalla.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTrackRow(row: any): Track {
  return {
    ...row,
    artist: row.artist,
    resolvedCoverUrl: row.cover_url ?? row.album?.cover_url ?? null,
    genres: (row.track_genres ?? []).map((tg: any) => tg.genre), // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

export type CatalogResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

const GENERIC_ERROR = "No pudimos cargar este contenido. Inténtalo de nuevo.";

/**
 * Secciones de Inicio. Tres queries independientes (no una sola gigante)
 * para poder mostrar cada sección con su propio loading/estado vacío.
 */
export async function getNewReleases(
  limit = 10
): Promise<CatalogResult<Track[]>> {
  const { data, error } = await supabase
    .from("tracks")
    .select(TRACK_SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, message: GENERIC_ERROR };
  return { ok: true, data: (data ?? []).map(mapTrackRow) };
}

export async function getPopularTracks(
  limit = 10
): Promise<CatalogResult<Track[]>> {
  const { data, error } = await supabase
    .from("tracks")
    .select(TRACK_SELECT)
    .eq("status", "published")
    .order("plays_count", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, message: GENERIC_ERROR };
  return { ok: true, data: (data ?? []).map(mapTrackRow) };
}

export async function getFeaturedArtists(
  limit = 10
): Promise<CatalogResult<ArtistSummary[]>> {
  const { data, error } = await supabase
    .from("artist_profiles")
    .select(ARTIST_SUMMARY_COLUMNS)
    .order("verified", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { ok: false, message: GENERIC_ERROR };
  return { ok: true, data: data ?? [] };
}

export async function getGenres(): Promise<CatalogResult<Genre[]>> {
  const { data, error } = await supabase
    .from("genres")
    .select("*")
    .order("name", { ascending: true });

  if (error) return { ok: false, message: GENERIC_ERROR };
  return { ok: true, data: data ?? [] };
}

/**
 * Búsqueda por texto libre. Usa ilike (substring) en vez del índice
 * full-text de la migración 0003 porque para un buscador "mientras se
 * escribe" ilike da mejores resultados con términos parciales — el índice
 * GIN queda preparado para una mejora futura con pg_trgm si el catálogo
 * crece mucho y ilike se vuelve lento.
 */
export async function searchCatalog(
  query: string
): Promise<CatalogResult<SearchResults>> {
  const term = query.trim();
  if (!term) return { ok: true, data: { tracks: [], artists: [], albums: [] } };

  const pattern = `%${term}%`;

  const [tracksRes, artistsRes, albumsRes] = await Promise.all([
    supabase
      .from("tracks")
      .select(TRACK_SELECT)
      .eq("status", "published")
      .ilike("title", pattern)
      .limit(20),
    // RPC: exacto > empieza por > contiene, luego verificados y más oyentes
    // (el perfil buscado sale primero, como en cualquier plataforma).
    supabase.rpc("search_artists", { q: term, max_results: 8 }),
    supabase
      .from("albums")
      .select(`*, artist:artist_profiles ( ${ARTIST_SUMMARY_COLUMNS} )`)
      .ilike("title", pattern)
      .limit(20),
  ]);

  if (tracksRes.error || artistsRes.error || albumsRes.error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  return {
    ok: true,
    data: {
      tracks: (tracksRes.data ?? []).map(mapTrackRow),
      artists: (artistsRes.data ?? []).map((a) => ({
        id: a.id,
        display_name: a.display_name,
        avatar_url: a.avatar_url,
        verified: a.verified,
      })),
      albums: (albumsRes.data ?? []) as AlbumWithArtist[],
    },
  };
}

export async function getArtistDetail(
  artistId: string
): Promise<CatalogResult<ArtistDetail>> {
  const [artistRes, tracksRes, albumsRes, linksRes] = await Promise.all([
    supabase.from("artist_profiles").select("*").eq("id", artistId).single(),
    supabase
      .from("tracks")
      .select(TRACK_SELECT)
      .eq("artist_id", artistId)
      .eq("status", "published")
      .order("plays_count", { ascending: false })
      .limit(200),
    supabase
      .from("albums")
      .select(`*, artist:artist_profiles ( ${ARTIST_SUMMARY_COLUMNS} )`)
      .eq("artist_id", artistId)
      .order("release_date", { ascending: false }),
    // Participaciones (feat) en canciones de otros artistas.
    supabase
      .from("track_artists")
      .select("track_id")
      .eq("artist_id", artistId)
      .eq("role", "featured")
      .limit(100),
  ]);

  if (artistRes.error || tracksRes.error || albumsRes.error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  const ownTracks = (tracksRes.data ?? []).map(mapTrackRow);
  const ownIds = new Set(ownTracks.map((t) => t.id));

  // Un fallo aquí no rompe el perfil: simplemente no se muestran colaboraciones.
  let collaborations: Track[] = [];
  const collabIds = (linksRes.data ?? []).map((l) => l.track_id).filter((id) => !ownIds.has(id));
  if (!linksRes.error && collabIds.length) {
    const collabRes = await supabase
      .from("tracks")
      .select(TRACK_SELECT)
      .in("id", collabIds)
      .eq("status", "published");
    if (!collabRes.error) {
      collaborations = (collabRes.data ?? []).map(mapTrackRow).sort(byReleaseDesc);
    }
  }

  return {
    ok: true,
    data: {
      ...artistRes.data,
      tracks: ownTracks,
      latest: [...ownTracks].sort(byReleaseDesc).slice(0, 10),
      collaborations,
      albums: (albumsRes.data ?? []) as AlbumWithArtist[],
    },
  };
}

function byReleaseDesc(a: Track, b: Track): number {
  const da = a.release_date ?? a.created_at;
  const db = b.release_date ?? b.created_at;
  return db.localeCompare(da);
}

export async function getAlbumDetail(
  albumId: string
): Promise<CatalogResult<AlbumDetail>> {
  const [albumRes, tracksRes] = await Promise.all([
    supabase
      .from("albums")
      .select(`*, artist:artist_profiles ( ${ARTIST_SUMMARY_COLUMNS} )`)
      .eq("id", albumId)
      .single(),
    supabase
      .from("tracks")
      .select(TRACK_SELECT)
      .eq("album_id", albumId)
      .eq("status", "published")
      .order("track_number", { ascending: true, nullsFirst: false }),
  ]);

  if (albumRes.error || tracksRes.error) {
    return { ok: false, message: GENERIC_ERROR };
  }

  return {
    ok: true,
    data: {
      ...(albumRes.data as AlbumWithArtist),
      tracks: (tracksRes.data ?? []).map(mapTrackRow),
    },
  };
}

/**
 * Fire-and-forget: no bloquea la reproducción si falla. La RPC solo suma
 * 1 (ver migración 0003) — nunca se manda un valor arbitrario desde acá.
 */
export function incrementTrackPlays(trackId: string): void {
  supabase.rpc("increment_track_plays", { track_id_input: trackId }).then(
    () => {},
    () => {}
  );
}

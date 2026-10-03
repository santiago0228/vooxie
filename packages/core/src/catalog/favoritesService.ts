import { supabase } from "../supabase/client";
import type { Track } from "./types";
import type { CatalogResult } from "./catalogService";

const GENERIC_ERROR = "No pudimos actualizar tus favoritos. Inténtalo de nuevo.";

export async function addFavorite(
  userId: string,
  trackId: string
): Promise<CatalogResult<undefined>> {
  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: userId, track_id: trackId });

  // Si ya era favorito (unique violation), lo tratamos como éxito —
  // el resultado final que le importa al usuario es el mismo.
  if (error && !error.message.toLowerCase().includes("duplicate")) {
    return { ok: false, message: GENERIC_ERROR };
  }
  return { ok: true, data: undefined };
}

export async function removeFavorite(
  userId: string,
  trackId: string
): Promise<CatalogResult<undefined>> {
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("track_id", trackId);

  if (error) return { ok: false, message: GENERIC_ERROR };
  return { ok: true, data: undefined };
}

const TRACK_SELECT_FOR_FAVORITES = `
  *,
  artist:artist_profiles ( id, display_name, avatar_url, verified ),
  album:albums ( cover_url ),
  track_genres ( genre:genres ( id, name ) )
`;

export async function getFavoriteTracks(
  userId: string
): Promise<CatalogResult<Track[]>> {
  const { data, error } = await supabase
    .from("favorites")
    .select(`created_at, track:tracks ( ${TRACK_SELECT_FOR_FAVORITES} )`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return { ok: false, message: GENERIC_ERROR };

  const tracks = (data ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) => row.track)
    .filter(Boolean)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((row: any) => ({
      ...row,
      resolvedCoverUrl: row.cover_url ?? row.album?.cover_url ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      genres: (row.track_genres ?? []).map((tg: any) => tg.genre),
    })) as Track[];

  return { ok: true, data: tracks };
}

/** Set de IDs favoritos del usuario — para pintar el corazón lleno/vacío
 * en listas sin traer el track completo de nuevo. */
export async function getFavoriteTrackIds(
  userId: string
): Promise<CatalogResult<Set<string>>> {
  const { data, error } = await supabase
    .from("favorites")
    .select("track_id")
    .eq("user_id", userId);

  if (error) return { ok: false, message: GENERIC_ERROR };
  return { ok: true, data: new Set((data ?? []).map((r) => r.track_id)) };
}

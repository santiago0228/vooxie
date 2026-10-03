import type { Database } from "../supabase/types.generated";
import type { ArtistProfile } from "../types/auth";

export type { ArtistProfile };
export type Genre = Database["public"]["Tables"]["genres"]["Row"];
export type Album = Database["public"]["Tables"]["albums"]["Row"];
export type TrackRow = Database["public"]["Tables"]["tracks"]["Row"];

/**
 * Artista resumido — lo que necesitan las listas/cards (Inicio, Descubrir,
 * dentro de un álbum). No trae bio completa para no sobre-pedir datos.
 */
export type ArtistSummary = Pick<
  ArtistProfile,
  "id" | "display_name" | "avatar_url" | "verified"
>;

/**
 * Canción "resuelta": trae el artista embebido (siempre se necesita para
 * mostrarla en una fila) y el cover ya resuelto (propio o heredado del
 * álbum — la resolución pasa en catalogService, no en cada pantalla).
 */
export type Track = TrackRow & {
  artist: ArtistSummary;
  /** cover_url propio si existe; si no, el del álbum; si no, null. */
  resolvedCoverUrl: string | null;
  genres: Pick<Genre, "id" | "name">[];
};

export type AlbumWithArtist = Album & {
  artist: ArtistSummary;
};

export type ArtistDetail = ArtistProfile & {
  /** Canciones propias, populares primero. */
  tracks: Track[];
  /** Canciones propias, lanzamientos más recientes primero. */
  latest: Track[];
  /** Canciones de otros artistas donde participa (feat). */
  collaborations: Track[];
  albums: AlbumWithArtist[];
};

export type AlbumDetail = AlbumWithArtist & {
  tracks: Track[];
};

export type SearchResults = {
  tracks: Track[];
  artists: ArtistSummary[];
  albums: AlbumWithArtist[];
};

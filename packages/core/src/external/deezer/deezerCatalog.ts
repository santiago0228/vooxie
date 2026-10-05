/** Perfiles de artista y álbumes en vivo desde Deezer (sin necesidad de importar). */
import type { ExternalAlbum, ExternalArtist, ExternalTrack } from "../types";
import { deezerGet } from "./client";
import { dedupeTracks } from "./deezerSearch";
import { mapDeezerAlbum, mapDeezerArtist, mapDeezerTrack, pickCover } from "./mapper";

type Page = { data?: unknown[] };
type Raw = Record<string, unknown>;

export type DeezerArtistDetail = {
  artist: ExternalArtist;
  topTracks: ExternalTrack[];
  albums: ExternalAlbum[];
};

export type DeezerAlbumDetail = {
  album: ExternalAlbum;
  tracks: ExternalTrack[];
};

/** "dz:artist:123" → 123 (null si no es un id de Deezer). */
export function parseDeezerId(ref: string, kind: "artist" | "album" | "track"): number | null {
  const prefix = kind === "track" ? "dz:" : `dz:${kind}:`;
  if (!ref.startsWith(prefix)) return null;
  const n = Number(ref.slice(prefix.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function getDeezerArtist(id: number): Promise<DeezerArtistDetail | null> {
  const [artistRaw, topRes, albumsRes] = await Promise.all([
    deezerGet<Raw>(`/artist/${id}`),
    deezerGet<Page>(`/artist/${id}/top`, { limit: 20 }).catch(() => ({ data: [] } as Page)),
    deezerGet<Page>(`/artist/${id}/albums`, { limit: 50 }).catch(() => ({ data: [] } as Page)),
  ]);
  const artist = mapDeezerArtist(artistRaw);
  if (!artist) return null;
  const topTracks = dedupeTracks(
    (topRes.data ?? []).map(mapDeezerTrack).filter((t): t is ExternalTrack => t !== null),
  );
  const albums = (albumsRes.data ?? [])
    .map(mapDeezerAlbum)
    .filter((a): a is ExternalAlbum => a !== null)
    // Los álbumes del listado de artista no traen artista: se les asigna el del perfil.
    .map((a) => ({ ...a, artist: { externalId: String(id), name: artist.name } }))
    .sort((x, y) => (y.releaseDate ?? "").localeCompare(x.releaseDate ?? ""));
  return { artist, topTracks, albums };
}

export async function getDeezerAlbum(id: number): Promise<DeezerAlbumDetail | null> {
  const raw = await deezerGet<Raw>(`/album/${id}`);
  const album = mapDeezerAlbum(raw);
  if (!album) return null;
  const cover = pickCover(raw);
  const albumArtist = (raw.artist ?? null) as Raw | null;
  const tracksRaw = ((raw.tracks as Page | undefined)?.data ?? []) as Raw[];
  const tracks = tracksRaw
    .map((t) =>
      mapDeezerTrack({
        ...t,
        // Las pistas de /album/{id} no repiten álbum ni, a veces, artista completo.
        album: { id, title: raw.title, cover_xl: cover.large, cover_medium: cover.thumb },
        artist: (t.artist as Raw | undefined) ?? albumArtist,
      }),
    )
    .filter((t): t is ExternalTrack => t !== null);
  return { album, tracks };
}

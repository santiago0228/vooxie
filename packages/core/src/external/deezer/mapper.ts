/** Mapeos puros Deezer → modelo interno. Todo se valida: nunca llega basura a la UI/player. */
import type { ExternalAlbum, ExternalArtist, ExternalTrack } from "../types";

const https = (v: unknown): string | null => (typeof v === "string" && v.startsWith("https://") ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const posInt = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.trunc(v) : null);

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | null => (v && typeof v === "object" ? (v as Raw) : null);

/** Foto de artista; Deezer devuelve una imagen vacía por defecto cuando no hay (URL con "/artist//"). */
export function pickPicture(a: Raw | null): string | null {
  if (!a) return null;
  for (const k of ["picture_xl", "picture_big", "picture_medium", "picture"]) {
    const u = https(a[k]);
    if (u && !u.includes("/artist//")) return u;
  }
  return null;
}

export function pickCover(a: Raw | null): { large: string | null; thumb: string | null } {
  if (!a) return { large: null, thumb: null };
  const ok = (u: string | null) => (u && !u.includes("/cover//") && !u.includes("/images//") ? u : null);
  const large = ok(https(a.cover_xl)) ?? ok(https(a.cover_big)) ?? ok(https(a.cover_medium)) ?? ok(https(a.cover));
  const thumb = ok(https(a.cover_medium)) ?? ok(https(a.cover_small)) ?? large;
  return { large, thumb };
}

export function deezerTrackId(id: number): string {
  return `dz:${id}`;
}

export function mapDeezerTrack(raw: unknown): ExternalTrack | null {
  const t = obj(raw);
  if (!t) return null;
  const id = posInt(t.id);
  const title = text(t.title_short) && text(t.title) ? (text(t.title) as string) : text(t.title);
  const artist = obj(t.artist);
  const artistName = text(artist?.name);
  if (!id || !title || !artist || !artistName) return null;
  if (t.readable === false) return null;

  const album = obj(t.album);
  const cover = pickCover(album);
  return {
    source: "youtube",
    externalId: deezerTrackId(id),
    title,
    artist: { externalId: String(posInt(artist.id) ?? artistName), name: artistName, handle: null },
    artwork: cover.large ? { thumbnail: cover.thumb ?? cover.large, large: cover.large } : null,
    durationSeconds: posInt(t.duration),
    genre: null,
    isExplicit: t.explicit_lyrics === true,
    streamRef: "", // se completa al emparejar con YouTube
    playCount: posInt(t.rank),
    deezerId: id,
    isrc: text(t.isrc),
    youtubeId: null,
    albumTitle: text(album?.title),
    streamUrl: null,
    streamExpiresAt: null,
    canvasUrl: null,
    producers: [],
  };
}

export function mapDeezerArtist(raw: unknown): ExternalArtist | null {
  const a = obj(raw);
  const id = posInt(a?.id);
  const name = text(a?.name);
  if (!a || !id || !name) return null;
  return {
    source: "youtube",
    externalId: `dz:artist:${id}`,
    name,
    handle: null,
    avatarUrl: pickPicture(a),
    verified: false,
    followerCount: posInt(a.nb_fan),
    trackCount: null,
  };
}

export function mapDeezerAlbum(raw: unknown): ExternalAlbum | null {
  const a = obj(raw);
  const id = posInt(a?.id);
  const title = text(a?.title);
  if (!a || !id || !title) return null;
  const artist = obj(a.artist);
  const cover = pickCover(a);
  const type = String(a.record_type ?? "album").toLowerCase();
  return {
    source: "youtube",
    externalId: `dz:album:${id}`,
    title,
    artist: {
      externalId: String(posInt(artist?.id) ?? "0"),
      name: text(artist?.name) ?? "Varios artistas",
    },
    artwork: cover.large ? { thumbnail: cover.thumb ?? cover.large, large: cover.large } : null,
    trackCount: posInt(a.nb_tracks),
    releaseDate: typeof a.release_date === "string" && /^\d{4}(-\d{2}-\d{2})?$/.test(a.release_date) && !a.release_date.startsWith("0000") ? a.release_date : null,
    albumType: type === "ep" ? "ep" : type === "single" ? "single" : type === "compile" ? "compilation" : "album",
  };
}

/** Clave para detectar duplicados (misma canción, distinta edición). */
export function trackKey(t: ExternalTrack): string {
  const n = (s: string) =>
    s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\(\[][^\)\]]*[\)\]]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  return `${n(t.artist.name)}|${n(t.title)}`;
}

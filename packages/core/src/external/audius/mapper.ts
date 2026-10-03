/**
 * AUDIUS MAPPER
 *
 * Convierte las respuestas crudas de la API de Audius al modelo interno
 * de VOOXIE (ExternalTrack, ExternalArtist, ExternalAlbum).
 *
 * Se mantiene separado del servicio para que los cambios en la API de
 * Audius solo requieran tocar este archivo, no el servicio ni la UI.
 *
 * Todos los campos son defensivos: si Audius agrega/quita campos,
 * el mapper retorna null en vez de lanzar una excepción.
 */

import type {
  ExternalTrack,
  ExternalArtist,
  ExternalAlbum,
  ExternalArtwork,
} from "../types";

// ─── Tipos crudos de la API de Audius ─────────────────────────────────────────
// Solo los campos que usamos — no tipamos la API completa.

interface AudiusArtwork {
  "150x150"?: string;
  "480x480"?: string;
  "1000x1000"?: string;
}

interface AudiusUser {
  id: string;
  name: string;
  handle: string;
  profile_picture?: AudiusArtwork | null;
  follower_count?: number;
  track_count?: number;
  is_verified?: boolean;
}

interface AudiusTrackRaw {
  id: string;
  title?: string;
  duration?: number;
  play_count?: number;
  is_streamable?: boolean;
  artwork?: AudiusArtwork | null;
  user?: AudiusUser;
  genre?: string;
  mood?: string;
  is_explicit?: boolean;
  // El SDK construye stream_url en algunos endpoints, pero no siempre
  // está presente en search — la construimos con buildAudiusStreamUrl()
}

interface AudiusPlaylistRaw {
  id: string;
  playlist_name?: string;
  artwork?: AudiusArtwork | null;
  user?: AudiusUser;
  track_count?: number;
  release_date?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function mapArtwork(artwork: AudiusArtwork | null | undefined): ExternalArtwork | null {
  if (!artwork) return null;
  const thumbnail = artwork["150x150"] ?? artwork["480x480"] ?? null;
  const large = artwork["1000x1000"] ?? artwork["480x480"] ?? null;
  if (!thumbnail) return null;
  return { thumbnail, large };
}

function mapUserArtwork(pic: AudiusArtwork | null | undefined): ExternalArtwork | null {
  if (!pic) return null;
  const thumbnail = pic["150x150"] ?? pic["480x480"] ?? null;
  const large = pic["480x480"] ?? null;
  if (!thumbnail) return null;
  return { thumbnail, large };
}

// ─── Mappers públicos ──────────────────────────────────────────────────────────

/**
 * Convierte un track crudo de Audius a ExternalTrack.
 *
 * @param raw        Objeto crudo del API de Audius
 * @param streamUrl  URL de stream ya construida (desde buildAudiusStreamUrl)
 * @returns          ExternalTrack o null si faltan campos obligatorios
 */
export function mapAudiusTrack(
  raw: unknown,
  streamUrl: string
): ExternalTrack | null {
  const t = raw as AudiusTrackRaw;

  if (!t?.id || !t?.title) return null;

  // Un track sin usuario es inválido en nuestro modelo
  if (!t.user?.id || !t.user?.name) return null;

  return {
    source: "audius",
    externalId: t.id,
    title: t.title,
    artist: {
      externalId: t.user.id,
      name: t.user.name,
      handle: t.user.handle ?? null,
    },
    artwork: mapArtwork(t.artwork),
    durationSeconds: typeof t.duration === "number" ? t.duration : null,
    genre: t.genre ?? null,
    isExplicit: t.is_explicit ?? false,
    streamRef: streamUrl,
    playCount: typeof t.play_count === "number" ? t.play_count : null,
  };
}

/**
 * Convierte un usuario/artista crudo de Audius a ExternalArtist.
 * @returns ExternalArtist o null si faltan campos obligatorios
 */
export function mapAudiusArtist(raw: unknown): ExternalArtist | null {
  const u = raw as AudiusUser;

  if (!u?.id || !u?.name) return null;

  return {
    source: "audius",
    externalId: u.id,
    name: u.name,
    handle: u.handle ?? null,
    avatarUrl: mapUserArtwork(u.profile_picture)?.thumbnail ?? null,
    verified: u.is_verified ?? false,
    followerCount: typeof u.follower_count === "number" ? u.follower_count : null,
    trackCount: typeof u.track_count === "number" ? u.track_count : null,
  };
}

/**
 * Convierte una playlist/álbum crudo de Audius a ExternalAlbum.
 * @returns ExternalAlbum o null si faltan campos obligatorios
 */
export function mapAudiusPlaylist(raw: unknown): ExternalAlbum | null {
  const p = raw as AudiusPlaylistRaw;

  if (!p?.id || !p?.playlist_name) return null;
  if (!p.user?.id || !p.user?.name) return null;

  return {
    source: "audius",
    externalId: p.id,
    title: p.playlist_name,
    artist: { externalId: p.user.id, name: p.user.name },
    artwork: mapArtwork(p.artwork),
    trackCount: typeof p.track_count === "number" ? p.track_count : null,
    releaseDate: p.release_date ?? null,
  };
}

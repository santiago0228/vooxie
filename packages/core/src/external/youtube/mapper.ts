/**
 * YOUTUBE MAPPER
 *
 * Convierte las respuestas externas (Edge Function / caché Supabase) al
 * modelo interno:
 *
 *   YouTubeSearchItem | YouTubeExtractResponse | CacheRow  ──▶  UnifiedTrack
 *   UnifiedTrack ──▶ ExternalTrack (contenedor que consumen UI y player)
 *
 * Todo se valida en runtime: una respuesta mal formada devuelve null en lugar
 * de propagar `undefined` al player.
 */

import type { Database } from "../../supabase/types.generated";
import type { ExternalTrack, UnifiedTrack } from "../types";
import type { YouTubeExtractResponse, YouTubeSearchItem } from "./types";

export type YouTubeCacheRow = Database["public"]["Tables"]["youtube_tracks_cache"]["Row"];

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Margen de seguridad: un stream que vence en menos de esto se renueva. */
export const STREAM_SAFETY_MARGIN_MS = 60_000;

export function isValidVideoId(id: unknown): id is string {
  return typeof id === "string" && VIDEO_ID_RE.test(id);
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
const https = (v: unknown): string | null =>
  typeof v === "string" && v.startsWith("https://") ? v : null;
const positiveInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

// ─── Validez del stream ───────────────────────────────────────────────────────

/**
 * ¿`streamUrl` sigue siendo utilizable? Falso si no hay URL, si no hay fecha de
 * expiración o si vence dentro del margen.
 */
export function isStreamValid(
  track: Pick<UnifiedTrack, "streamUrl" | "streamExpiresAt"> | Pick<ExternalTrack, "streamUrl" | "streamExpiresAt">,
  now: number = Date.now(),
  marginMs: number = STREAM_SAFETY_MARGIN_MS,
): boolean {
  if (!track.streamUrl || !track.streamExpiresAt) return false;
  const exp = Date.parse(track.streamExpiresAt);
  return Number.isFinite(exp) && exp - now > marginMs;
}

// ─── → UnifiedTrack ───────────────────────────────────────────────────────────

/** Resultado de búsqueda: metadata sin stream. */
export function mapSearchItem(item: YouTubeSearchItem): UnifiedTrack | null {
  if (!isValidVideoId(item?.videoId)) return null;
  const title = str(item.title);
  if (!title) return null;
  return {
    id: item.videoId,
    title,
    artist: str(item.artist) ?? "Desconocido",
    artworkUrl: https(item.artworkUrl),
    streamUrl: null,
    duration: positiveInt(item.duration),
    canvasUrl: null,
    producers: [],
    source: "youtube",
    streamExpiresAt: null,
  };
}

/** Respuesta de `resolve` (Edge Function). */
export function mapExtractResponse(res: YouTubeExtractResponse): UnifiedTrack | null {
  if (!isValidVideoId(res?.videoId)) return null;
  const title = str(res.title);
  if (!title) return null;
  const streamUrl = https(res.streamUrl);
  const exp = typeof res.streamExpiresAt === "string" && Number.isFinite(Date.parse(res.streamExpiresAt))
    ? res.streamExpiresAt
    : null;
  return {
    id: res.videoId,
    title,
    artist: str(res.artist) ?? "Desconocido",
    artworkUrl: https(res.artworkUrl),
    // stream y expiración siempre van juntos
    streamUrl: streamUrl && exp ? streamUrl : null,
    duration: positiveInt(res.duration),
    canvasUrl: https(res.canvasUrl),
    producers: strArray(res.producers),
    source: "youtube",
    streamExpiresAt: streamUrl && exp ? exp : null,
  };
}

/** Fila de `youtube_tracks_cache` (lectura directa con RLS). */
export function mapCacheRow(row: YouTubeCacheRow): UnifiedTrack | null {
  return mapExtractResponse({
    videoId: row.youtube_id,
    title: row.title,
    artist: row.artist,
    artworkUrl: row.artwork_url,
    duration: row.duration,
    streamUrl: row.stream_url,
    streamExpiresAt: row.stream_expires_at,
    canvasUrl: row.canvas_url,
    producers: row.producers,
  });
}

// ─── UnifiedTrack → ExternalTrack ─────────────────────────────────────────────

export function unifiedToExternalTrack(t: UnifiedTrack): ExternalTrack {
  return {
    source: "youtube",
    externalId: t.id,
    title: t.title,
    // YouTube no expone un channelId estable en este pipeline: se usa el nombre.
    artist: { externalId: t.artist, name: t.artist, handle: null },
    artwork: t.artworkUrl ? { thumbnail: t.artworkUrl, large: t.artworkUrl } : null,
    durationSeconds: t.duration,
    genre: null,
    isExplicit: false,
    streamRef: t.id,
    playCount: null,
    streamUrl: t.streamUrl,
    streamExpiresAt: t.streamExpiresAt,
    canvasUrl: t.canvasUrl,
    producers: t.producers,
  };
}

/** Inverso (para reanudar favoritos persistidos como ExternalTrack). */
export function externalToUnifiedTrack(t: ExternalTrack): UnifiedTrack {
  return {
    id: t.externalId,
    title: t.title,
    artist: t.artist.name,
    artworkUrl: t.artwork?.large ?? t.artwork?.thumbnail ?? null,
    streamUrl: t.streamUrl ?? null,
    duration: t.durationSeconds,
    canvasUrl: t.canvasUrl ?? null,
    producers: t.producers ?? [],
    source: "youtube",
    streamExpiresAt: t.streamExpiresAt ?? null,
  };
}

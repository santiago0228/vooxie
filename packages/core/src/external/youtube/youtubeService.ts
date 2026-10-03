/**
 * YOUTUBE SERVICE
 *
 * Punto de entrada público del pipeline de audio de YouTube.
 *
 *   SEARCH  (liviano, sin audio)          RESOLVE  (solo al elegir una canción)
 *   ─────────────────────────────         ──────────────────────────────────────
 *   searchYouTubeCache()  ← Supabase      resolveTrack(videoId)
 *   searchYouTubeRemote() ← youtube-proxy   ├─ caché Supabase: ¿stream válido? → devolver
 *                                          └─ si falta/expiró → youtube-proxy
 *                                               └─ microservicio yt-dlp → UPSERT caché
 *
 * NOTA: este módulo NO reproduce. El player solo recibe `UnifiedTrack.streamUrl`.
 */

import { supabase } from "../../supabase/client";
import type { UnifiedTrack } from "../types";
import { callProxy, YouTubeError } from "./client";
import {
  isStreamValid,
  isValidVideoId,
  mapCacheRow,
  mapExtractResponse,
  mapSearchItem,
  type YouTubeCacheRow,
} from "./mapper";

const CACHE_COLUMNS =
  "youtube_id,title,artist,artwork_url,stream_url,duration,canvas_url,producers,stream_expires_at,created_at,updated_at";

// ─── SEARCH ───────────────────────────────────────────────────────────────────

/** Escapa comodines de LIKE para que la query del usuario sea texto literal. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Busca en la caché de Supabase (tracks ya conocidos). Solo lectura (RLS).
 * Un fallo de caché NUNCA rompe la búsqueda: devuelve [].
 */
export async function searchYouTubeCache(query: string, limit: number): Promise<UnifiedTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const pattern = likePattern(q);
  try {
    const [byTitle, byArtist] = await Promise.all([
      supabase.from("youtube_tracks_cache").select(CACHE_COLUMNS).ilike("title", pattern).limit(limit),
      supabase.from("youtube_tracks_cache").select(CACHE_COLUMNS).ilike("artist", pattern).limit(limit),
    ]);
    const rows = [...(byTitle.data ?? []), ...(byArtist.data ?? [])] as YouTubeCacheRow[];
    const seen = new Set<string>();
    const out: UnifiedTrack[] = [];
    for (const row of rows) {
      if (seen.has(row.youtube_id)) continue;
      seen.add(row.youtube_id);
      const t = mapCacheRow(row);
      if (t) out.push(t);
    }
    return out.slice(0, limit);
  } catch {
    return [];
  }
}

/** Busca vía youtube-proxy → yt-dlp (solo metadata; sin extraer audio). */
export async function searchYouTubeRemote(query: string, limit: number): Promise<UnifiedTrack[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await callProxy({ action: "search", query: q });
  const out: UnifiedTrack[] = [];
  for (const item of res.items) {
    const t = mapSearchItem(item);
    if (t) out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── RESOLVE ──────────────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<UnifiedTrack>>();

export type ResolveOptions = {
  /**
   * URL de stream que acaba de FALLAR en el player. Si la caché todavía contiene
   * esa misma URL, se fuerza una nueva extracción; si otro usuario/dispositivo
   * ya la renovó, se devuelve la nueva sin extraer otra vez.
   */
  staleStreamUrl?: string | null;
};

async function readCache(videoId: string): Promise<UnifiedTrack | null> {
  try {
    const { data, error } = await supabase
      .from("youtube_tracks_cache")
      .select(CACHE_COLUMNS)
      .eq("youtube_id", videoId)
      .maybeSingle();
    if (error || !data) return null;
    return mapCacheRow(data as YouTubeCacheRow);
  } catch {
    return null;
  }
}

/**
 * Resuelve un track: devuelve metadata + streamUrl válido.
 *
 *   caché ──▶ ¿metadata + stream válido? ──▶ sí: devolver
 *                                         └▶ no: youtube-proxy (yt-dlp) ──▶ UPSERT ──▶ devolver
 *
 * Metadata (título, artista, artwork, duración, Canvas, productores, youtube_id)
 * es permanente; solo se renueva el stream.
 */
export function resolveTrack(videoId: string, options: ResolveOptions = {}): Promise<UnifiedTrack> {
  if (!isValidVideoId(videoId)) {
    return Promise.reject(new YouTubeError("videoId inválido.", "invalid_response", "INVALID_REQUEST"));
  }
  const stale = options.staleStreamUrl ?? null;
  const key = `${videoId}|${stale ?? ""}`;

  const existing = inflight.get(key);
  if (existing) return existing;

  const work = (async (): Promise<UnifiedTrack> => {
    const cached = await readCache(videoId);
    if (cached && isStreamValid(cached) && cached.streamUrl !== stale) return cached;

    const res = await callProxy({
      action: "resolve",
      videoId,
      ...(stale ? { staleStreamUrl: stale } : {}),
    });
    const track = mapExtractResponse(res.track);
    if (!track || !track.streamUrl) {
      throw new YouTubeError("No se obtuvo un stream de audio válido.", "stream_failed", "STREAM_RESOLUTION_FAILED");
    }
    return track;
  })();

  inflight.set(key, work);
  const clear = () => inflight.delete(key);
  work.then(clear, clear);
  return work;
}

// ─── ADMIN (Canvas / productores) ─────────────────────────────────────────────

export type TrackExtrasPatch = {
  /** https://… ; undefined = no cambiar. */
  canvasUrl?: string;
  /** Quitar el Canvas. */
  clearCanvas?: boolean;
  /** undefined = no cambiar. */
  producers?: string[];
};

/**
 * Solo administradores (RPC `admin_set_track_extras`, valida `is_admin()` en el
 * servidor). Mantiene el `youtube_id`; no toca stream ni metadata.
 */
export async function adminSetTrackExtras(
  videoId: string,
  patch: TrackExtrasPatch,
): Promise<UnifiedTrack> {
  if (!isValidVideoId(videoId)) {
    throw new YouTubeError("videoId inválido.", "invalid_response", "INVALID_REQUEST");
  }
  const { data, error } = await supabase.rpc("admin_set_track_extras", {
    p_youtube_id: videoId,
    p_canvas_url: patch.canvasUrl ?? null,
    p_producers: patch.producers ?? null,
    p_clear_canvas: patch.clearCanvas ?? false,
  });
  if (error) {
    const forbidden = error.code === "42501";
    throw new YouTubeError(
      forbidden ? "No tienes permisos de administrador." : "No se pudo guardar el Canvas.",
      forbidden ? "auth_error" : "proxy_error",
    );
  }
  const track = data ? mapCacheRow(data as YouTubeCacheRow) : null;
  if (!track) throw new YouTubeError("Respuesta inválida al guardar.", "invalid_response");
  return track;
}

export { YouTubeError };

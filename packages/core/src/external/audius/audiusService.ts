/**
 * AUDIUS SERVICE
 *
 * Punto de entrada público para toda interacción con la API de Audius.
 * Los componentes/stores importan desde aquí — nunca desde client.ts ni mapper.ts.
 *
 * Cada función:
 * - Llama a audiusFetch() (que maneja host discovery, timeout, retry)
 * - Mapea la respuesta cruda al modelo interno
 * - Retorna ExternalResult<T> — nunca lanza excepciones hacia afuera
 */

import { audiusFetch, buildAudiusStreamUrl, AudiusError } from "./client";
import { mapAudiusTrack, mapAudiusArtist } from "./mapper";
import { popularArtists, popularTracks } from "./popularity";
import type {
  ExternalTrack,
  ExternalArtist,
  ExternalSearchResults,
  ExternalResult,
} from "../types";

// ─── Constantes ────────────────────────────────────────────────────────────────

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// ─── Respuestas crudas esperadas de la API ─────────────────────────────────────

interface AudiusListResponse<T> {
  data: T[];
}

interface AudiusSingleResponse<T> {
  data: T;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function handleAudiusError(e: unknown): ExternalResult<never> {
  if (e instanceof AudiusError) {
    return { ok: false, message: e.message, code: e.code };
  }
  return {
    ok: false,
    message: "Error inesperado al conectar con Audius.",
    code: "network_error",
  };
}

// ─── Búsqueda ──────────────────────────────────────────────────────────────────

/**
 * Búsqueda unificada en Audius: tracks + artistas + playlists.
 *
 * Las tres búsquedas corren en paralelo (Promise.all) para minimizar
 * la latencia total. Si una falla, las otras siguen.
 */
export async function searchAudius(
  query: string,
  limit = DEFAULT_LIMIT
): Promise<ExternalResult<ExternalSearchResults>> {
  const q = query.trim();
  if (!q) {
    return {
      ok: true,
      data: { source: "audius", tracks: [], artists: [], albums: [] },
    };
  }

  const safeLimit = Math.min(limit, MAX_LIMIT);
  // Se piden más de los necesarios: luego se filtra por popularidad y quedan pocos.
  const params = { query: q, limit: Math.min(safeLimit * 4, MAX_LIMIT) };

  // Correr las tres búsquedas en paralelo — si una falla, no bloquea las otras
  const [tracksRes, artistsRes] = await Promise.allSettled([
    audiusFetch<AudiusListResponse<unknown>>("/v1/tracks/search", params),
    audiusFetch<AudiusListResponse<unknown>>("/v1/users/search", params),
  ]);

  // Tracks — solo los populares (el resto es relleno genérico). Las URLs de stream
  // se construyen DESPUÉS de filtrar, así no se hace trabajo para temas descartados.
  let tracks: ExternalTrack[] = [];
  if (tracksRes.status === "fulfilled") {
    const rawTracks = tracksRes.value?.data ?? [];
    const popular = rawTracks
      .map((raw) => ({ raw, plays: (raw as { play_count?: number }).play_count ?? 0 }))
      .sort((x, y) => y.plays - x.plays)
      .slice(0, safeLimit * 2)
      .map((x) => x.raw);
    const streamUrls = await Promise.allSettled(
      popular.map((t: unknown) => {
        const id = (t as { id?: string }).id;
        return id ? buildAudiusStreamUrl(id) : Promise.reject("no id");
      })
    );
    const mapped = popular
      .map((raw, i) => {
        const urlResult = streamUrls[i];
        if (urlResult.status !== "fulfilled") return null;
        return mapAudiusTrack(raw, urlResult.value);
      })
      .filter((t): t is ExternalTrack => t !== null);
    tracks = popularTracks(mapped, q, safeLimit);
  }

  // Artistas conocidos (verificados o con seguidores)
  let artists: ExternalArtist[] = [];
  if (artistsRes.status === "fulfilled") {
    artists = popularArtists(
      (artistsRes.value?.data ?? [])
        .map(mapAudiusArtist)
        .filter((a): a is ExternalArtist => a !== null),
      Math.min(safeLimit, 5)
    );
  }

  // Playlists de Audius: sin señal de popularidad fiable, se omiten (eran mayormente genéricas).
  const albums: ExternalSearchResults["albums"] = [];

  // Si todo falló, retornamos error
  if (tracksRes.status === "rejected" && artistsRes.status === "rejected") {
    return handleAudiusError(tracksRes.reason);
  }

  return {
    ok: true,
    data: { source: "audius", tracks, artists, albums },
  };
}

// ─── Track por ID ──────────────────────────────────────────────────────────────

/**
 * Obtiene un track de Audius por su ID (hash, ej: "D7KyD").
 * Incluye la stream URL en el resultado.
 */
export async function getAudiusTrack(
  trackId: string
): Promise<ExternalResult<ExternalTrack>> {
  try {
    const [response, streamUrl] = await Promise.all([
      audiusFetch<AudiusSingleResponse<unknown>>(`/v1/tracks/${trackId}`),
      buildAudiusStreamUrl(trackId),
    ]);

    const track = mapAudiusTrack(response?.data, streamUrl);
    if (!track) {
      return {
        ok: false,
        message: "El track de Audius no tiene los datos necesarios.",
        code: "invalid_response",
      };
    }

    return { ok: true, data: track };
  } catch (e) {
    return handleAudiusError(e);
  }
}

// ─── Artista por ID ────────────────────────────────────────────────────────────

/**
 * Obtiene un artista/usuario de Audius por su ID.
 */
export async function getAudiusArtist(
  userId: string
): Promise<ExternalResult<ExternalArtist>> {
  try {
    const response = await audiusFetch<AudiusSingleResponse<unknown>>(
      `/v1/users/${userId}`
    );

    const artist = mapAudiusArtist(response?.data);
    if (!artist) {
      return {
        ok: false,
        message: "El artista de Audius no tiene los datos necesarios.",
        code: "invalid_response",
      };
    }

    return { ok: true, data: artist };
  } catch (e) {
    return handleAudiusError(e);
  }
}

/**
 * Obtiene los tracks publicados de un artista de Audius.
 */
export async function getAudiusArtistTracks(
  userId: string,
  limit = DEFAULT_LIMIT
): Promise<ExternalResult<ExternalTrack[]>> {
  try {
    const [response] = await Promise.all([
      audiusFetch<AudiusListResponse<unknown>>(`/v1/users/${userId}/tracks`, {
        limit: Math.min(limit, MAX_LIMIT),
      }),
    ]);

    const rawTracks = response?.data ?? [];
    const streamUrls = await Promise.allSettled(
      rawTracks.map((t: unknown) => {
        const id = (t as { id?: string }).id;
        return id ? buildAudiusStreamUrl(id) : Promise.reject("no id");
      })
    );

    const tracks = rawTracks
      .map((raw, i) => {
        const urlResult = streamUrls[i];
        if (urlResult.status !== "fulfilled") return null;
        return mapAudiusTrack(raw, urlResult.value);
      })
      .filter((t): t is ExternalTrack => t !== null);

    return { ok: true, data: tracks };
  } catch (e) {
    return handleAudiusError(e);
  }
}

// ─── Stream URL ────────────────────────────────────────────────────────────────

/**
 * Retorna la URL de stream para un track de Audius.
 *
 * Esta URL es un redirect (302) al audio real.
 * expo-audio sigue el redirect automáticamente.
 *
 * Se exporta por separado para cuando el reproductor necesite
 * obtener/actualizar la URL en el momento de reproducir (en caso de que
 * el host haya cambiado desde la búsqueda).
 */
export async function getAudiusStreamUrl(
  trackId: string
): Promise<ExternalResult<string>> {
  try {
    const url = await buildAudiusStreamUrl(trackId);
    return { ok: true, data: url };
  } catch (e) {
    return handleAudiusError(e);
  }
}

/**
 * artworkResolver — Fase 5
 *
 * Resuelve la mejor portada disponible para cualquier PlayableItem.
 *
 * PRIORIDAD:
 *   1. Portada personalizada VOOXIE (vooxieOverrideUrl) — campo futuro que
 *      permitirá asociar portadas propias a canciones de YouTube/Audius/VOOXIE.
 *      Cuando se implemente, se pasará como override explícito.
 *
 *   2. Portada canónica de VOOXIE (resolvedCoverUrl) — para tracks propios
 *      puede ser la portada del track o la del álbum al que pertenece.
 *
 *   3. Artwork grande de la fuente externa (artwork.large) — para YouTube
 *      es el thumbnail HQ (maxresdefault > hqdefault > mqdefault según el
 *      mapper). Para Audius es la imagen 1000x1000 si está disponible.
 *
 *   4. Artwork thumbnail de la fuente externa (artwork.thumbnail).
 *
 *   5. null — el player muestra un placeholder.
 *
 * MEJORA DE CALIDAD PARA YOUTUBE:
 *   El mapper de YouTube ya intenta obtener maxresdefault. Si no existe (404),
 *   cae a hqdefault. Si quisieras forzar máxima calidad siempre, construir
 *   una URL de maxresdefault aquí como intento 1 y hqdefault como intento 2
 *   (requeriría carga con onError y estado — fuera del scope de la Fase 5).
 *   Por ahora se usa lo que el mapper ya entrega.
 *
 * ARQUITECTURA PREPARADA PARA PORTADAS PERSONALIZADAS:
 *   El parámetro `vooxieOverrideUrl` es el gancho explícito. Cuando en fases
 *   posteriores se implemente un catálogo de portadas personalizadas por
 *   identificador canónico (isrc, mbid, videoId), el llamador pasará la URL
 *   resuelta aquí y tendrá prioridad sobre todo lo demás.
 *
 *   Ejemplo futuro:
 *     const customArt = useCustomArtwork(getItemId(track)); // futura query
 *     const { large, thumb } = resolveArtwork(track, customArt?.url);
 */

import {
  type PlayableItem,
  isVooxieTrack,
  isExternalTrack,
} from "@vooxie/core";

export type ResolvedArtwork = {
  /** URL de la portada a usar en el player (grande, para cover area). */
  large: string | null;
  /** URL de la portada pequeña (para miniplayer, cabecera de letras). */
  thumb: string | null;
};

/**
 * Resuelve el mejor artwork disponible para el track.
 *
 * @param track        El PlayableItem actual del store.
 * @param overrideUrl  Portada personalizada VOOXIE (null si no existe aún).
 *                     Cuando se implemente el sistema de portadas canónicas,
 *                     este parámetro recibirá la URL resuelta.
 */
export function resolveArtwork(
  track: PlayableItem | null,
  overrideUrl: string | null = null
): ResolvedArtwork {
  if (!track) return { large: null, thumb: null };

  // 1. Portada personalizada VOOXIE (override explícito, mayor prioridad)
  if (overrideUrl) {
    return { large: overrideUrl, thumb: overrideUrl };
  }

  // 2. Track VOOXIE nativo — resolvedCoverUrl viene del catálogo (propio o álbum)
  if (isVooxieTrack(track)) {
    const url = track.resolvedCoverUrl;
    return { large: url, thumb: url };
  }

  // 3. Track externo (YouTube / Audius)
  if (isExternalTrack(track)) {
    const large = track.artwork?.large ?? null;
    const thumb = track.artwork?.thumbnail ?? null;

    // Prioridad: large → thumb → null
    // Para YouTube, artwork.large ya es el mejor thumbnail disponible (el mapper
    // intenta maxresdefault y cae a hqdefault). No manipulamos la URL aquí
    // para evitar thumbnails rotos (YouTube devuelve imagen de placeholder
    // en lugar de 404 para maxresdefault no disponible).
    return {
      large: large ?? thumb,
      thumb: thumb ?? large,
    };
  }

  return { large: null, thumb: null };
}

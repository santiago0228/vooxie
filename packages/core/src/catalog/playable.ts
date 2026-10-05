/**
 * Adaptador catálogo → player.
 *
 * Las canciones importadas (Deezer) no tienen `audio_url`: su audio sale de
 * `youtube_id`. Para el player son un track de YouTube más: se convierten a
 * `ExternalTrack` con el youtube_id como id, y el TrackResolver (nivel superior)
 * obtiene el stream con resolveTrack(). Los tracks con archivo propio no cambian.
 */
import type { ExternalTrack } from "../external/types";
import { unifiedToExternalTrack } from "../external/youtube/mapper";
import type { PlayableItem } from "../player/PlayableItem";
import type { Track } from "./types";

export function isCatalogYouTubeTrack(item: PlayableItem): item is Track & { youtube_id: string } {
  return !("externalId" in item) && !item.audio_url && typeof item.youtube_id === "string" && item.youtube_id.length === 11;
}

export function toPlayable(item: PlayableItem): PlayableItem {
  if (!isCatalogYouTubeTrack(item)) return item;
  const external: ExternalTrack = unifiedToExternalTrack({
    id: item.youtube_id,
    title: item.title,
    artist: item.artist.display_name,
    artworkUrl: item.resolvedCoverUrl,
    streamUrl: null,
    duration: item.duration_seconds > 0 ? item.duration_seconds : null,
    canvasUrl: null,
    producers: [],
    source: "youtube",
    streamExpiresAt: null,
  });
  return { ...external, isExplicit: item.is_explicit };
}

/** Id con el que el player conoce un track del catálogo (importados: youtube_id). */
export function getPlayableId(track: Track): string {
  return !track.audio_url && track.youtube_id ? track.youtube_id : track.id;
}

/**
 * Las miniaturas `hqdefault`/`sddefault` de YouTube son 4:3 con barras negras
 * arriba y abajo (el video 16:9 va centrado). Un zoom de ~1.34 las elimina al
 * mostrarlas con `resizeMode="cover"` en un contenedor cuadrado.
 */
export function coverZoomFor(url: string | null | undefined): number {
  return url && /i\.ytimg\.com\/vi\/[\w-]{11}\/(hqdefault|sddefault|default)\.jpg/.test(url) ? 1.34 : 1;
}

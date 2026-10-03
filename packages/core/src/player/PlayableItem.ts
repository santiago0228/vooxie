/**
 * PlayableItem — tipo unión del reproductor de VOOXIE
 *
 * Representa cualquier elemento que puede cargarse en el reproductor,
 * independientemente de su fuente de origen.
 *
 * DISCRIMINACIÓN:
 * - Track (Supabase):  item.source === "vooxie"  — pero Track no tiene campo
 *   `source` explícito, así que usamos `isExternalTrack()` para discriminar.
 * - ExternalTrack:     item.source === "audius" | "youtube"
 *
 * DISEÑO:
 * Track de Supabase tiene campos específicos de DB (id UUID, artist_id FK,
 * album_id FK, duration_seconds, audio_url, resolvedCoverUrl...) que no
 * existen en fuentes externas. En vez de contaminarlo con opcionales,
 * mantenemos los dos tipos separados y definimos una unión aquí.
 *
 * HELPERS:
 * Los helpers de este archivo evitan que el código de UI/store tenga que
 * hacer `if ('externalId' in item)` en todos lados — se importan junto
 * con el tipo y se usan como `isExternalTrack(item)`.
 */

import type { Track } from "../catalog/types";
import type { ExternalTrack } from "../external/types";

export type PlayableItem = Track | ExternalTrack;

// ─── Type guards ───────────────────────────────────────────────────────────────

/** Retorna true si el item es un ExternalTrack (Audius o YouTube). */
export function isExternalTrack(item: PlayableItem): item is ExternalTrack {
  return "externalId" in item;
}

/** Retorna true si el item es un Track nativo de VOOXIE (Supabase). */
export function isVooxieTrack(item: PlayableItem): item is Track {
  return !("externalId" in item);
}

// ─── Accessors normalizados ────────────────────────────────────────────────────
// Permiten leer campos comunes sin discriminar el tipo en cada lugar.

/** ID único del item — UUID para VOOXIE, externalId para externos. */
export function getItemId(item: PlayableItem): string {
  if (isExternalTrack(item)) return item.externalId;
  return item.id;
}

/** Título del item. */
export function getItemTitle(item: PlayableItem): string {
  return item.title;
}

/** Nombre del artista. */
export function getItemArtistName(item: PlayableItem): string {
  if (isExternalTrack(item)) return item.artist.name;
  return item.artist.display_name;
}

/** URL del thumbnail/cover para mostrar en UI (MiniPlayer, player completo). */
export function getItemCoverUrl(item: PlayableItem): string | null {
  if (isExternalTrack(item)) return item.artwork?.thumbnail ?? null;
  return item.resolvedCoverUrl;
}

/**
 * URL de alta resolución del artwork (para el player completo).
 * Para VOOXIE usa el mismo cover; para externos usa la imagen grande si existe.
 */
export function getItemLargeCoverUrl(item: PlayableItem): string | null {
  if (isExternalTrack(item)) return item.artwork?.large ?? item.artwork?.thumbnail ?? null;
  return item.resolvedCoverUrl;
}

/** Duración en segundos, o 0 si no se conoce. */
export function getItemDuration(item: PlayableItem): number {
  if (isExternalTrack(item)) return item.durationSeconds ?? 0;
  return item.duration_seconds ?? 0;
}

/** Fuente del contenido ("vooxie" | "audius" | "youtube"). */
export function getItemSource(item: PlayableItem): "vooxie" | "audius" | "youtube" {
  if (isExternalTrack(item)) return item.source;
  return "vooxie";
}

/** Referencia para reproducción:
 *  - VOOXIE:  audio_url (URL de Supabase Storage)
 *  - Audius:  streamRef (URL de stream — sigue un 302 al audio)
 *  - YouTube: streamRef (videoId; el audio sale de `streamUrl` resuelto por resolveTrack)
 */
export function getItemStreamRef(item: PlayableItem): string {
  if (isExternalTrack(item)) return item.streamRef;
  // Los tracks importados no tienen audio_url (solo youtube_id): se reproducen
  // convirtiéndolos a ExternalTrack de YouTube; aquí "" = sin URL propia.
  return item.audio_url ?? "";
}

/** true si el contenido es explícito. */
export function getItemIsExplicit(item: PlayableItem): boolean {
  if (isExternalTrack(item)) return item.isExplicit;
  return item.is_explicit ?? false;
}

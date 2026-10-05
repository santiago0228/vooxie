/**
 * Identidad y "foto" de una canción para guardarla (me gusta / playlists).
 *
 *   track_key:  vx:<uuid> (catálogo VooXiE) · dz:<id> (Deezer) · au:<id> (Audius) · yt:<videoId>
 *
 * El snapshot NUNCA incluye streams: son temporales y los resuelve el player al reproducir.
 */
import type { Track } from "../catalog/types";
import type { ExternalTrack } from "../external/types";
import { isExternalTrack, type PlayableItem } from "../player/PlayableItem";

const KEY_RE = /^(vx|dz|au|yt):[A-Za-z0-9_-]{1,64}$/;

export function trackKeyOf(item: PlayableItem): string | null {
  let key: string;
  if (!isExternalTrack(item)) {
    key = `vx:${item.id}`;
  } else if (item.deezerId != null && item.deezerId > 0) {
    key = `dz:${item.deezerId}`;
  } else if (item.source === "audius") {
    key = `au:${item.externalId}`;
  } else {
    key = `yt:${item.externalId}`;
  }
  return KEY_RE.test(key) ? key : null;
}

export function isValidTrackKey(key: string): boolean {
  return KEY_RE.test(key);
}

export type TrackSnapshot = Record<string, unknown>;

export function toSnapshot(item: PlayableItem): TrackSnapshot {
  if (!isExternalTrack(item)) {
    return { kind: "vooxie", track: item } as unknown as TrackSnapshot;
  }
  const { streamUrl: _u, streamExpiresAt: _e, ...rest } = item;
  void _u;
  void _e;
  return { kind: "external", track: { ...rest, streamUrl: null, streamExpiresAt: null } } as unknown as TrackSnapshot;
}

export function fromSnapshot(snapshot: unknown): PlayableItem | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as { kind?: unknown; track?: unknown };
  const t = s.track as Record<string, unknown> | undefined;
  if (!t || typeof t !== "object") return null;
  if (s.kind === "vooxie") {
    return typeof t.id === "string" && typeof t.title === "string" ? (t as unknown as Track) : null;
  }
  if (s.kind === "external") {
    const ok =
      typeof t.externalId === "string" &&
      typeof t.title === "string" &&
      (t.source === "audius" || t.source === "youtube") &&
      !!t.artist && typeof (t.artist as { name?: unknown }).name === "string";
    return ok ? ({ ...(t as unknown as ExternalTrack), streamUrl: null, streamExpiresAt: null }) : null;
  }
  return null;
}

/** Datos mínimos para pintar una fila sin reconstruir el track completo. */
export function snapshotSummary(snapshot: unknown): { title: string; artist: string; cover: string | null } {
  const item = fromSnapshot(snapshot);
  if (!item) return { title: "Canción no disponible", artist: "", cover: null };
  if (isExternalTrack(item)) {
    return { title: item.title, artist: item.artist.name, cover: item.artwork?.large ?? item.artwork?.thumbnail ?? null };
  }
  return { title: item.title, artist: item.artist.display_name, cover: item.resolvedCoverUrl ?? null };
}

/**
 * TrackResolver — nivel superior que mantiene cada track de YouTube con un
 * stream VÁLIDO. Es el único lugar de la app que dispara `resolveTrack()`;
 * el player (AudioEngine) nunca extrae audio.
 *
 *   currentTrack (youtube) ── ¿stream válido? ──no──▶ resolveTrack(id)
 *                                                       └─▶ updateTrack(UnifiedTrack renovado) ─▶ AudioEngine
 *   AudioEngine ── playbackError ──▶ resolveTrack(id, { staleStreamUrl }) ─▶ updateTrack
 *
 * Protecciones (ver resolverPolicy.ts, con tests):
 *  · requestId + comparación con el track actual: una respuesta tardía de A
 *    jamás pisa a B/C (cambios rápidos A→B→C).
 *  · máximo 2 renovaciones forzadas por selección.
 *  · si la resolución FALLA no se reintenta sola (sin bucles contra el servidor);
 *    el usuario reintenta tocando play (status "error").
 */

import { useEffect, useRef } from "react";
import { usePlayerStore, type PlayerState } from "./usePlayerStore";
import { getItemId, isExternalTrack } from "./PlayableItem";
import { isStreamValid, unifiedToExternalTrack } from "../external/youtube/mapper";
import { resolveTrack } from "../external/youtube/youtubeService";
import { planResolve } from "./resolverPolicy";

export function TrackResolver() {
  const currentTrack = usePlayerStore((s: PlayerState) => s.currentTrack);
  const playbackError = usePlayerStore((s: PlayerState) => s.playbackError);
  const updateTrack = usePlayerStore((s: PlayerState) => s.updateTrack);
  const reportStatus = usePlayerStore((s: PlayerState) => s._reportStatus);
  const clearPlaybackError = usePlayerStore((s: PlayerState) => s._clearPlaybackError);

  const requestSeq = useRef(0);
  const inFlightKey = useRef<string | null>(null);
  const memo = useRef<{ id: string | null; failed: boolean; forced: number }>({ id: null, failed: false, forced: 0 });

  const ytTrack =
    currentTrack && isExternalTrack(currentTrack) && currentTrack.source === "youtube" ? currentTrack : null;
  const id = currentTrack ? getItemId(currentTrack) : null;
  const needsStream = ytTrack !== null && !isStreamValid(ytTrack);
  const errorForThis = playbackError && playbackError.trackId === id ? playbackError : null;

  useEffect(() => {
    // Otro track: contadores nuevos.
    if (memo.current.id !== id) memo.current = { id, failed: false, forced: 0 };
    if (errorForThis?.manual) memo.current = { id, failed: false, forced: 0 };

    const plan = planResolve({
      id,
      isYouTube: ytTrack !== null,
      needsStream,
      error: errorForThis,
      failed: memo.current.failed,
      forcedCount: memo.current.forced,
    });

    if (plan.type === "none") return;
    if (plan.type === "give_up") {
      clearPlaybackError();
      reportStatus("error");
      return;
    }
    if (!id) return;

    const key = `${id}|${plan.stale ?? ""}|${plan.forced ? 1 : 0}`;
    if (inFlightKey.current === key) return;
    inFlightKey.current = key;
    if (plan.forced) memo.current.forced += 1;

    const myRequest = ++requestSeq.current;
    const isCurrent = () => {
      if (myRequest !== requestSeq.current) return false; // llegó una solicitud más nueva
      const cur = usePlayerStore.getState().currentTrack;
      return !!cur && getItemId(cur) === id; // el usuario ya cambió de canción
    };

    resolveTrack(id, { staleStreamUrl: plan.stale })
      .then((unified) => {
        if (!isCurrent()) return;
        memo.current.failed = false;
        updateTrack(unifiedToExternalTrack(unified));
        clearPlaybackError();
      })
      .catch((err: unknown) => {
        if (!isCurrent()) return;
        console.warn("[TrackResolver] no se pudo resolver el stream:", (err as Error)?.message);
        memo.current.failed = true;
        clearPlaybackError();
        reportStatus("error");
      })
      .finally(() => {
        if (inFlightKey.current === key) inFlightKey.current = null;
      });
  }, [id, ytTrack, needsStream, errorForThis, updateTrack, reportStatus, clearPlaybackError]);

  return null;
}

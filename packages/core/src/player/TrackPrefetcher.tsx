/**
 * TrackPrefetcher — deja listo el stream de la SIGUIENTE canción mientras suena la actual,
 * para que el cambio de canción sea casi instantáneo. Es una optimización: no hace nada si
 * falla, y nunca toca al player (solo calienta la caché de resolución).
 */
import { useEffect } from "react";
import { usePlayerStore, type PlayerState } from "./usePlayerStore";
import { isExternalTrack } from "./PlayableItem";
import { prefetchTracks } from "../external/youtube/youtubeService";

const START_DELAY_MS = 4_000;

export function TrackPrefetcher() {
  const queue = usePlayerStore((s: PlayerState) => s.queue);
  const currentIndex = usePlayerStore((s: PlayerState) => s.currentIndex);
  const status = usePlayerStore((s: PlayerState) => s.status);
  const repeatMode = usePlayerStore((s: PlayerState) => s.repeatMode);

  const playing = status === "playing";

  useEffect(() => {
    if (!playing || currentIndex < 0) return;
    const nextIndex =
      currentIndex + 1 < queue.length ? currentIndex + 1 : repeatMode === "all" && queue.length > 1 ? 0 : -1;
    if (nextIndex < 0) return;
    const next = queue[nextIndex];
    if (!next || !isExternalTrack(next) || next.source !== "youtube") return;

    // Pequeña espera: si el usuario salta enseguida, no se gasta una extracción en vano.
    const timer = setTimeout(() => prefetchTracks([next]), START_DELAY_MS);
    return () => clearTimeout(timer);
  }, [playing, currentIndex, queue, repeatMode]);

  return null;
}

/**
 * usePlayerExtras — gestiona SOLO el modo visual (cover/lyrics/canvas/video).
 *
 * Shuffle y repeat se movieron al store global (usePlayerStore) para que
 * afecten la reproducción real y no solo la UI.
 */
import { useState, useCallback } from "react";

export type PlayerViewMode = "cover" | "canvas" | "lyrics" | "video";

export function usePlayerExtras() {
  const [viewMode, setViewMode] = useState<PlayerViewMode>("cover");

  const switchToLyrics = useCallback(() => setViewMode("lyrics"), []);
  const switchToCover = useCallback(() => setViewMode("cover"), []);
  const switchToCanvas = useCallback(() => setViewMode("canvas"), []);
  const switchToVideo = useCallback(() => setViewMode("video"), []);

  return {
    viewMode, setViewMode,
    switchToLyrics, switchToCover, switchToCanvas, switchToVideo,
  };
}

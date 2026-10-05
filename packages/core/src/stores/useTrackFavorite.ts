import { useCallback } from "react";
import { trackKeyOf } from "../library/trackSnapshot";
import { isExternalTrack, type PlayableItem } from "../player/PlayableItem";
import { useAuthStore } from "./useAuthStore";
import { useFavoritesStore } from "./useFavoritesStore";
import { useLibraryStore } from "./useLibraryStore";

/**
 * "Me gusta" unificado: canciones del catálogo VooXiE (tabla `favorites`) y de cualquier
 * otra fuente (`saved_tracks`) se tratan igual para la UI.
 */
export function useTrackFavorite(item: PlayableItem | null): {
  isFavorite: boolean;
  /** Devuelve un mensaje de error (o null si todo salió bien). */
  toggle: () => Promise<string | null>;
  canSave: boolean;
} {
  const session = useAuthStore((s) => s.session);
  const favIds = useFavoritesStore((s) => s.ids);
  const toggleVx = useFavoritesStore((s) => s.toggle);
  const savedKeys = useLibraryStore((s) => s.savedKeys);
  const toggleSaved = useLibraryStore((s) => s.toggleSaved);

  // Audio propio de VooXiE → tabla `favorites` (por uuid). Todo lo demás (externo/importado) → saved_tracks.
  const vxId = item && !isExternalTrack(item) && item.audio_url ? item.id : null;
  const key = item ? trackKeyOf(item) : null;
  const isFavorite = !item || !key ? false : vxId ? favIds.has(vxId) : savedKeys.has(key);

  const toggle = useCallback(async (): Promise<string | null> => {
    if (!item || !key) return "Esta canción no se puede guardar.";
    if (!session) return "Inicia sesión para guardar canciones.";
    if (vxId) {
      await toggleVx(session.user.id, vxId);
      return null;
    }
    const res = await toggleSaved(item);
    return res.ok ? null : res.message;
  }, [item, key, session, vxId, toggleVx, toggleSaved]);

  return { isFavorite, toggle, canSave: !!key };
}

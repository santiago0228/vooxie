import { create } from "zustand";
import {
  addFavorite,
  removeFavorite,
  getFavoriteTrackIds,
} from "../catalog/favoritesService";

export type FavoritesState = {
  ids: Set<string>;
  loaded: boolean;
  load: (userId: string) => Promise<void>;
  toggle: (userId: string, trackId: string) => Promise<void>;
  reset: () => void;
};

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  ids: new Set(),
  loaded: false,

  load: async (userId) => {
    const result = await getFavoriteTrackIds(userId);
    if (result.ok) set({ ids: result.data, loaded: true });
  },

  toggle: async (userId, trackId) => {
    const current = get().ids;
    const isFavorite = current.has(trackId);

    // Optimista: la UI responde al toque, y se revierte si el server falla.
    const next = new Set(current);
    isFavorite ? next.delete(trackId) : next.add(trackId);
    set({ ids: next });

    const result = isFavorite
      ? await removeFavorite(userId, trackId)
      : await addFavorite(userId, trackId);

    if (!result.ok) {
      set({ ids: current }); // revertir
    }
  },

  reset: () => set({ ids: new Set(), loaded: false }),
}));

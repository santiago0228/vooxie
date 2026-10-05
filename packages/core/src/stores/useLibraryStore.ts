import { create } from "zustand";
import {
  addToPlaylist,
  createPlaylist,
  listMyPlaylists,
  listSavedTracks,
  saveTrack,
  unsaveTrack,
  type PlaylistSummary,
  type SavedTrack,
} from "../library/libraryService";
import { trackKeyOf } from "../library/trackSnapshot";
import type { PlayableItem } from "../player/PlayableItem";

/**
 * Biblioteca en memoria: me gusta de fuentes externas + mis playlists.
 * (Los me gusta del catálogo VooXiE siguen en useFavoritesStore; `useTrackFavorite` los unifica.)
 */
export type LibraryState = {
  userId: string | null;
  loaded: boolean;
  savedKeys: Set<string>;
  saved: SavedTrack[];
  playlists: PlaylistSummary[];

  load: (userId: string) => Promise<void>;
  reset: () => void;
  refreshPlaylists: () => Promise<void>;
  /** Devuelve el nuevo estado (true = guardada) o un mensaje de error. */
  toggleSaved: (item: PlayableItem) => Promise<{ ok: true; saved: boolean } | { ok: false; message: string }>;
  createPlaylist: (name: string, options?: { collaborative?: boolean }) => Promise<
    { ok: true; playlist: PlaylistSummary } | { ok: false; message: string }
  >;
  addToPlaylist: (playlistId: string, item: PlayableItem) => Promise<
    { ok: true; result: "added" | "exists" } | { ok: false; message: string }
  >;
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  userId: null,
  loaded: false,
  savedKeys: new Set(),
  saved: [],
  playlists: [],

  load: async (userId) => {
    set({ userId });
    const [saved, playlists] = await Promise.all([listSavedTracks(userId), listMyPlaylists(userId)]);
    if (get().userId !== userId) return; // cambió la sesión mientras cargaba
    set({
      loaded: true,
      ...(saved.ok ? { saved: saved.data, savedKeys: new Set(saved.data.map((s) => s.key)) } : {}),
      ...(playlists.ok ? { playlists: playlists.data } : {}),
    });
  },

  reset: () => set({ userId: null, loaded: false, savedKeys: new Set(), saved: [], playlists: [] }),

  refreshPlaylists: async () => {
    const { userId } = get();
    if (!userId) return;
    const res = await listMyPlaylists(userId);
    if (res.ok && get().userId === userId) set({ playlists: res.data });
  },

  toggleSaved: async (item) => {
    const { userId, savedKeys, saved } = get();
    if (!userId) return { ok: false, message: "Inicia sesión para guardar canciones." };
    const key = trackKeyOf(item);
    if (!key) return { ok: false, message: "Esta canción no se puede guardar." };

    const was = savedKeys.has(key);
    // Optimista: el corazón responde al toque y se revierte si falla.
    const nextKeys = new Set(savedKeys);
    if (was) nextKeys.delete(key);
    else nextKeys.add(key);
    set({
      savedKeys: nextKeys,
      saved: was ? saved.filter((s) => s.key !== key) : [{ key, item, savedAt: new Date().toISOString() }, ...saved],
    });

    const res = was ? await unsaveTrack(userId, key) : await saveTrack(userId, item);
    if (!res.ok) {
      set({ savedKeys, saved });
      return { ok: false, message: res.message };
    }
    return { ok: true, saved: !was };
  },

  createPlaylist: async (name, options) => {
    const { userId } = get();
    if (!userId) return { ok: false, message: "Inicia sesión para crear playlists." };
    const res = await createPlaylist(userId, name, { collaborative: options?.collaborative });
    if (!res.ok) return res;
    set({ playlists: [res.data, ...get().playlists] });
    return { ok: true, playlist: res.data };
  },

  addToPlaylist: async (playlistId, item) => {
    const { userId } = get();
    if (!userId) return { ok: false, message: "Inicia sesión para usar playlists." };
    const res = await addToPlaylist(userId, playlistId, item);
    if (!res.ok) return res;
    if (res.data === "added") get().refreshPlaylists();
    return { ok: true, result: res.data };
  },
}));

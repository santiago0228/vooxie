import { create } from "zustand";
import type { PlayableItem } from "../player/PlayableItem";

/**
 * Hoja de acciones de una canción (me gusta, playlist, cola, artista…).
 * Cualquier pantalla la abre con `open(track)` (o `openPlaylists(track)` para ir directo a
 * "Añadir a playlist"); la hoja única vive en el layout raíz.
 */
export type TrackMenuView = "menu" | "playlists";

type TrackMenuState = {
  track: PlayableItem | null;
  view: TrackMenuView;
  open: (track: PlayableItem) => void;
  openPlaylists: (track: PlayableItem) => void;
  close: () => void;
};

export const useTrackMenuStore = create<TrackMenuState>((set) => ({
  track: null,
  view: "menu",
  open: (track) => set({ track, view: "menu" }),
  openPlaylists: (track) => set({ track, view: "playlists" }),
  close: () => set({ track: null, view: "menu" }),
}));

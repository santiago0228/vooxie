import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlayableItem } from "../player/PlayableItem";

/**
 * useRecentSearchesStore — Historial de reproducción como búsquedas recientes
 *
 * CAMBIO IMPORTANTE respecto a la versión anterior:
 * Ya no guardamos texto plano ("adiós"). Guardamos el PlayableItem
 * completo que el usuario reprodujo — con portada, título, artista, etc.
 * Esto permite mostrar en "Búsquedas recientes":
 *   [portada]  Adiós
 *              Eladio Carrión    +  ⋮  ×
 *
 * Y al tocar el elemento, se vuelve a reproducir exactamente ese track.
 *
 * COMPATIBILIDAD:
 * La clave de AsyncStorage cambió ("vooxie-recent-tracks" en vez de
 * "vooxie-recent-searches") para evitar conflictos con datos viejos.
 */

export type RecentTrackItem = {
  /** ID único de la entrada en el historial (no del track) */
  id: string;
  /** El PlayableItem serializado para poder reproducirlo */
  track: PlayableItem;
  /** Timestamp de cuándo se reprodujo — para ordenar más reciente primero */
  playedAt: number;
};

/**
 * Artista cuyo perfil abrió el usuario desde la búsqueda. Igual que las canciones:
 * solo se guarda lo que se abre; lo que solo se escribió NO se guarda.
 */
export type RecentArtistItem = {
  id: string;
  artistId: string;
  name: string;
  avatarUrl: string | null;
  verified: boolean;
  playedAt: number;
};

type RecentSearchesState = {
  items: RecentTrackItem[];
  artists: RecentArtistItem[];
  /** Registra un perfil de artista abierto. Deduplica por artistId. */
  addArtist: (artist: { id: string; display_name: string; avatar_url: string | null; verified: boolean }) => void;
  removeArtist: (id: string) => void;
  /** Añade un track al historial. Deduplica por trackId/externalId. */
  addTrack: (track: PlayableItem) => void;
  remove: (id: string) => void;
  clear: () => void;
};

const MAX_ITEMS = 20;

function getTrackKey(track: PlayableItem): string {
  // Discriminar por tipo: los tracks de Supabase tienen 'id', los externos 'externalId'
  if ("externalId" in track) {
    return `${track.source}:${track.externalId}`;
  }
  return `vooxie:${track.id}`;
}

export const useRecentSearchesStore = create<RecentSearchesState>()(
  persist(
    (set, get) => ({
      items: [],
      artists: [],

      addArtist: (artist) => {
        const withoutDupe = get().artists.filter((a) => a.artistId !== artist.id);
        const entry: RecentArtistItem = {
          id: `artist:${artist.id}-${Date.now()}`,
          artistId: artist.id,
          name: artist.display_name,
          avatarUrl: artist.avatar_url,
          verified: artist.verified,
          playedAt: Date.now(),
        };
        set({ artists: [entry, ...withoutDupe].slice(0, MAX_ITEMS) });
      },

      removeArtist: (id) => set({ artists: get().artists.filter((a) => a.id !== id) }),

      addTrack: (track) => {
        const key = getTrackKey(track);
        // Eliminar duplicado si existe
        const withoutDupe = get().items.filter(
          (i) => getTrackKey(i.track) !== key
        );
        const newItem: RecentTrackItem = {
          id: `${key}-${Date.now()}`,
          track,
          playedAt: Date.now(),
        };
        set({ items: [newItem, ...withoutDupe].slice(0, MAX_ITEMS) });
      },

      remove: (id) =>
        set({ items: get().items.filter((i) => i.id !== id) }),

      clear: () => set({ items: [], artists: [] }),
    }),
    {
      name: "vooxie-recent-tracks",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// ─── Helpers de acceso ─────────────────────────────────────────────────────────

/** Obtiene la URL de portada de un RecentTrackItem para mostrarla en UI */
export function getRecentCoverUrl(item: RecentTrackItem): string | null {
  const { track } = item;
  if ("externalId" in track) {
    return track.artwork?.thumbnail ?? null;
  }
  return track.resolvedCoverUrl ?? null;
}

/** Obtiene el título de un RecentTrackItem */
export function getRecentTitle(item: RecentTrackItem): string {
  return item.track.title;
}

/** Obtiene el nombre del artista de un RecentTrackItem */
export function getRecentArtistName(item: RecentTrackItem): string {
  const { track } = item;
  if ("externalId" in track) return track.artist.name;
  return track.artist.display_name;
}

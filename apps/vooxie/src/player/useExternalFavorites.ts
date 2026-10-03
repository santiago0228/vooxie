/**
 * useExternalFavorites — favoritos para tracks externos (Audius, YouTube).
 *
 * La tabla `favorites` de Supabase solo acepta UUIDs de tracks VOOXIE.
 * Para tracks externos usamos AsyncStorage con clave `vooxie:ext_favs`.
 *
 * Identidad: `source:externalId` (ej. "audius:abc123", "youtube:dQw4w9WgXcQ")
 * Metadatos guardados: title, artist, artwork, durationSeconds, streamRef
 * — suficiente para restaurar el track sin re-buscar.
 *
 * El Set de IDs (strings) se mantiene en memoria para consultas O(1).
 * La serialización a AsyncStorage es asíncrona y no bloquea la UI.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ExternalTrack } from "@vooxie/core";

const STORAGE_KEY = "vooxie:ext_favs_v1";

type StoredFav = {
  key: string; // "source:externalId"
  track: ExternalTrack;
  savedAt: number;
};

type ExternalFavoritesHook = {
  has: (key: string) => boolean;
  toggle: (source: string, track: ExternalTrack) => Promise<void>;
  list: () => StoredFav[];
  loaded: boolean;
};

let globalFavs: Map<string, StoredFav> = new Map();
let globalLoaded = false;
const subscribers = new Set<() => void>();

function notify() {
  subscribers.forEach((cb) => cb());
}

async function persist() {
  try {
    const arr = Array.from(globalFavs.values());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {}
}

async function loadFromStorage() {
  if (globalLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr: StoredFav[] = JSON.parse(raw);
      globalFavs = new Map(arr.map((f) => [f.key, f]));
    }
  } catch {}
  globalLoaded = true;
  notify();
}

// Cargar al importar el módulo (una sola vez)
loadFromStorage();

export function useExternalFavorites(): ExternalFavoritesHook {
  const [, forceUpdate] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    const cb = () => {
      if (mounted.current) forceUpdate((n: number) => n + 1);
    };
    subscribers.add(cb);
    return () => {
      mounted.current = false;
      subscribers.delete(cb);
    };
  }, []);

  const has = useCallback((key: string) => globalFavs.has(key), []);

  const toggle = useCallback(async (source: string, track: ExternalTrack) => {
    const key = `${source}:${track.externalId}`;
    if (globalFavs.has(key)) {
      globalFavs.delete(key);
    } else {
      globalFavs.set(key, { key, track, savedAt: Date.now() });
    }
    notify();
    await persist();
  }, []);

  const list = useCallback(() => {
    return Array.from(globalFavs.values()).sort(
      (a, b) => b.savedAt - a.savedAt
    );
  }, []);

  return { has, toggle, list, loaded: globalLoaded };
}

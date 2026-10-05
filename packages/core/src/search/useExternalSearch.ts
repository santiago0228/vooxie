/**
 * useExternalSearch
 *
 * Orquesta las fuentes externas de búsqueda:
 *   · Deezer  → catálogo OFICIAL (canciones, artistas, álbumes con portada y metadata). Fuente principal.
 *   · Audius  → solo temas/artistas populares.
 *   · YouTube → RESPALDO: solo si Deezer falla o no devuelve canciones.
 *
 * Cada fuente tiene su propio estado: una lenta o caída no bloquea a las demás.
 * Tras mostrar resultados se PRECARGAN los streams de las 2 primeras canciones, así el tap
 * encuentra el audio casi listo.
 */

import { useEffect, useRef, useState } from "react";
import { searchAudius } from "../external/audius/audiusService";
import { searchDeezer } from "../external/deezer/deezerSearch";
import { prefetchTracks } from "../external/youtube/youtubeService";
import { searchYouTubeTracks } from "./unifiedSearch";
import type { ExternalSearchResults } from "../external/types";

const PREFETCH_TOP = 2;
const PREFETCH_DELAY_MS = 700;

// ─── Estado por fuente ─────────────────────────────────────────────────────────

export type ExternalSourceState = {
  results: ExternalSearchResults | null;
  loading: boolean;
  error: string | null;
};

export type UseExternalSearchResult = {
  audius: ExternalSourceState;
  /** Catálogo oficial (Deezer). */
  deezer: ExternalSourceState;
  /** Respaldo de YouTube (solo se llena si Deezer no sirve). */
  youtube: ExternalSourceState;
  /** true si al menos una fuente está cargando */
  searching: boolean;
};

const EMPTY_STATE: ExternalSourceState = { results: null, loading: false, error: null };
const LOADING_STATE: ExternalSourceState = { results: null, loading: true, error: null };

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * @param query  Query ya debounceada. Si es vacía, resetea el estado.
 * @param limit  Máximo de canciones por fuente.
 */
export function useExternalSearch(query: string, limit = 12): UseExternalSearchResult {
  const [audiusState, setAudiusState] = useState<ExternalSourceState>(EMPTY_STATE);
  const [deezerState, setDeezerState] = useState<ExternalSourceState>(EMPTY_STATE);
  const [youtubeState, setYoutubeState] = useState<ExternalSourceState>(EMPTY_STATE);

  // Cancela resultados de búsquedas obsoletas si el query cambia antes de que terminen.
  const runIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    const runId = ++runIdRef.current;
    const stale = () => runId !== runIdRef.current;
    let prefetchTimer: ReturnType<typeof setTimeout> | null = null;

    if (!trimmed) {
      setAudiusState(EMPTY_STATE);
      setDeezerState(EMPTY_STATE);
      setYoutubeState(EMPTY_STATE);
      return;
    }

    setAudiusState(LOADING_STATE);
    setDeezerState(LOADING_STATE);
    setYoutubeState(EMPTY_STATE);

    // Audius (independiente)
    searchAudius(trimmed, limit)
      .then((res) => {
        if (stale()) return;
        setAudiusState(
          res.ok
            ? { results: res.data, loading: false, error: null }
            : { results: null, loading: false, error: res.message },
        );
      })
      .catch(() => {
        if (!stale()) setAudiusState({ results: null, loading: false, error: "Error al conectar con Audius." });
      });

    // Respaldo de YouTube: se lanza solo si el catálogo oficial no sirve.
    const runYoutubeFallback = () => {
      setYoutubeState(LOADING_STATE);
      searchYouTubeTracks(trimmed, limit, (partial) => {
        if (!stale()) setYoutubeState({ results: partial, loading: true, error: null });
      })
        .then((res) => {
          if (stale()) return;
          setYoutubeState(
            res.ok
              ? { results: res.data, loading: false, error: null }
              : { results: null, loading: false, error: res.message },
          );
        })
        .catch(() => {
          if (!stale()) setYoutubeState({ results: null, loading: false, error: "Error al conectar con YouTube." });
        });
    };

    // Catálogo oficial (Deezer)
    searchDeezer(trimmed, limit)
      .then((res) => {
        if (stale()) return;
        if (res.ok && res.data.tracks.length > 0) {
          setDeezerState({ results: res.data, loading: false, error: null });
          // Precarga de las primeras canciones (se cancela si el usuario sigue escribiendo).
          prefetchTimer = setTimeout(() => {
            if (!stale()) prefetchTracks(res.data.tracks.slice(0, PREFETCH_TOP));
          }, PREFETCH_DELAY_MS);
          return;
        }
        setDeezerState(
          res.ok
            ? { results: res.data, loading: false, error: null }
            : { results: null, loading: false, error: res.message },
        );
        runYoutubeFallback();
      })
      .catch(() => {
        if (stale()) return;
        setDeezerState({ results: null, loading: false, error: "Error al conectar con el catálogo." });
        runYoutubeFallback();
      });

    return () => {
      if (prefetchTimer) clearTimeout(prefetchTimer);
    };
  }, [query, limit]);

  return {
    audius: audiusState,
    deezer: deezerState,
    youtube: youtubeState,
    searching: audiusState.loading || deezerState.loading || youtubeState.loading,
  };
}

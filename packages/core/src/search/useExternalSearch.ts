/**
 * useExternalSearch
 *
 * Orquesta la búsqueda en Audius y (opcionalmente) YouTube.
 * Se llama desde discover.tsx junto con searchCatalog para tener
 * resultados de VOOXIE + fuentes externas en la misma pantalla.
 *
 * DISEÑO:
 * - Cada fuente tiene su propio estado de carga y error — si Audius falla,
 *   YouTube puede seguir mostrando resultados y viceversa.
 * - Los resultados se cachean en memoria por query (Map de JS).
 *   Si el usuario repite una búsqueda reciente, no se vuelve a llamar
 *   a la API. El caché se limpia si supera MAX_CACHE_ENTRIES entradas.
 * - El debounce lo maneja discover.tsx (ya existe a 350ms) — este hook
 *   recibe `query` ya debounceada y ejecuta inmediatamente.
 * - YouTube va por la Edge Function `youtube-proxy`; un error de YouTube
 *   (p. ej. sin sesión) no afecta a las demás fuentes.
 *
 * USO:
 *   const { audius, youtube, searching } = useExternalSearch(debouncedQuery);
 */

import { useState, useEffect, useRef } from "react";
import { searchAudius } from "../external/audius/audiusService";
import { searchYouTubeTracks } from "./unifiedSearch";
import type { ExternalSearchResults } from "../external/types";

// ─── Caché en memoria ──────────────────────────────────────────────────────────

const MAX_CACHE_ENTRIES = 30;

type CacheEntry = {
  audius: ExternalSearchResults | null;
  youtube: ExternalSearchResults | null;
};

const cache = new Map<string, CacheEntry>();

function getCached(query: string): CacheEntry | null {
  return cache.get(query.toLowerCase().trim()) ?? null;
}

function setCached(query: string, entry: CacheEntry): void {
  const key = query.toLowerCase().trim();
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Eliminar la entrada más antigua (primera en el Map)
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, entry);
}

// ─── YouTube siempre disponible si Supabase está configurado ───────────────────
// (la búsqueda va por la Edge Function `youtube-proxy`; si falla o no hay sesión,
//  el error se refleja en el estado de la fuente sin romper las demás).

function isYouTubeConfigured(): boolean {
  return true;
}

// ─── Estado por fuente ─────────────────────────────────────────────────────────

export type ExternalSourceState = {
  results: ExternalSearchResults | null;
  loading: boolean;
  error: string | null;
};

export type UseExternalSearchResult = {
  audius: ExternalSourceState;
  youtube: ExternalSourceState;
  /** true si al menos una fuente está cargando */
  searching: boolean;
};

const EMPTY_STATE: ExternalSourceState = {
  results: null,
  loading: false,
  error: null,
};

// ─── Hook ──────────────────────────────────────────────────────────────────────

/**
 * @param query  Query ya debounceada. Si es vacía, resetea el estado.
 * @param limit  Máximo de resultados por fuente (default 15 — suficiente para
 *               la sección de búsqueda sin saturar la pantalla).
 */
export function useExternalSearch(
  query: string,
  limit = 15
): UseExternalSearchResult {
  const [audiusState, setAudiusState] = useState<ExternalSourceState>(EMPTY_STATE);
  const [youtubeState, setYoutubeState] = useState<ExternalSourceState>(EMPTY_STATE);

  // Ref para cancelar búsquedas obsoletas si el query cambia antes de que terminen
  const runIdRef = useRef(0);

  const youtubeAvailable = isYouTubeConfigured();

  useEffect(() => {
    const trimmed = query.trim();

    // Query vacía — resetear sin llamar APIs
    if (!trimmed) {
      setAudiusState(EMPTY_STATE);
      setYoutubeState(EMPTY_STATE);
      return;
    }

    // Caché hit — mostrar inmediatamente sin loading
    const cached = getCached(trimmed);
    if (cached) {
      setAudiusState({
        results: cached.audius,
        loading: false,
        error: null,
      });
      setYoutubeState({
        results: cached.youtube,
        loading: false,
        error: null,
      });
      return;
    }

    // Nuevo run — incrementar ID para invalidar runs anteriores
    const runId = ++runIdRef.current;

    // Marcar como cargando
    setAudiusState({ results: null, loading: true, error: null });
    if (youtubeAvailable) {
      setYoutubeState({ results: null, loading: true, error: null });
    }

    // Lanzar búsquedas en paralelo
    const audiusPromise = searchAudius(trimmed, limit);
    const youtubePromise = youtubeAvailable
      ? searchYouTubeTracks(trimmed, limit)
      : Promise.resolve(null);

    Promise.allSettled([audiusPromise, youtubePromise]).then(
      ([audiusResult, youtubeResult]) => {
        // Si el query cambió mientras esperábamos, ignorar esta respuesta
        if (runId !== runIdRef.current) return;

        let audiusData: ExternalSearchResults | null = null;
        let youtubeData: ExternalSearchResults | null = null;

        // Audius
        if (audiusResult.status === "fulfilled") {
          const res = audiusResult.value;
          if (res.ok) {
            audiusData = res.data;
            setAudiusState({ results: res.data, loading: false, error: null });
          } else {
            setAudiusState({ results: null, loading: false, error: res.message });
          }
        } else {
          setAudiusState({
            results: null,
            loading: false,
            error: "Error al conectar con Audius.",
          });
        }

        // YouTube
        if (youtubeAvailable) {
          if (youtubeResult.status === "fulfilled" && youtubeResult.value !== null) {
            const res = youtubeResult.value;
            if (res.ok) {
              youtubeData = res.data;
              setYoutubeState({ results: res.data, loading: false, error: null });
            } else {
              setYoutubeState({ results: null, loading: false, error: res.message });
            }
          } else if (youtubeResult.status === "rejected") {
            setYoutubeState({
              results: null,
              loading: false,
              error: "Error al conectar con YouTube.",
            });
          }
        }

        // Guardar en caché (incluso si hubo error en una fuente — evita
        // reintentar inmediatamente con la misma query)
        setCached(trimmed, { audius: audiusData, youtube: youtubeData });
      }
    );
  }, [query, limit, youtubeAvailable]);

  return {
    audius: audiusState,
    youtube: youtubeState,
    searching: audiusState.loading || youtubeState.loading,
  };
}

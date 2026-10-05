export * from "./supabase/client";
export * from "./stores/useSettingsStore";
export * from "./stores/useAuthStore";
export * from "./stores/useFavoritesStore";
export * from "./stores/useTrackMenuStore";
export * from "./stores/useLibraryStore";
export * from "./stores/useTrackFavorite";
export * from "./library/libraryService";
export * from "./library/trackSnapshot";
export * from "./auth/authService";
export * from "./auth/errors";
export * from "./auth/deepLinks";
export * from "./auth/artistProfileService";
export * from "./types/auth";
export * from "./catalog/types";
export * from "./catalog/catalogService";
export * from "./catalog/favoritesService";
export * from "./catalog/releaseService";
export * from "./catalog/useReleaseDraftStore";
export * from "./storage/uploadService";
export * from "./player/usePlayerStore";
export * from "./player/AudioEngine";
export * from "./player/TrackResolver";
export * from "./player/TrackPrefetcher";
export * from "./player/PlayableItem";
export * from "./search/useRecentSearchesStore";
export * from "./search/useExternalSearch";
export * from "./search/searchView";
export * from "./search/unifiedSearch";

// ─── Fase 4 — Fuentes externas de contenido ───────────────────────────────────
// Tipos del modelo externo (ExternalTrack, ExternalArtist, ContentSource…)
export * from "./external/types";

// Audius — búsqueda, tracks, artistas, stream URLs
export * from "./external/audius/audiusService";
// cliente y error internos (para tests y diagnóstico)
export { AudiusError, invalidateAudiusHost } from "./external/audius/client";

// YouTube — búsqueda (caché + yt-dlp), resolveTrack, tipos y mapper
export * from "./external/youtube/youtubeService";
export * from "./external/youtube/types";
// Catálogo (Deezer): búsqueda y perfiles con metadata oficial
export * from "./external/deezer/deezerSearch";
export * from "./external/deezer/deezerCatalog";
export { mapDeezerTrack } from "./external/deezer/mapper";
export {
  isStreamValid,
  isValidVideoId,
  mapSearchItem,
  mapExtractResponse,
  mapCacheRow,
  unifiedToExternalTrack,
  externalToUnifiedTrack,
  STREAM_SAFETY_MARGIN_MS,
} from "./external/youtube/mapper";
// error interno (para tests y diagnóstico)
export { YouTubeError } from "./external/youtube/client";

// A medida que avancen las fases se agregan aquí:
// playlistService, libraryService (playlists guardadas)...
export { toPlayable, getPlayableId, isCatalogYouTubeTrack, coverZoomFor } from "./catalog/playable";

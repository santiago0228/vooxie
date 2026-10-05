/**
 * VOOXIE — Modelo de contenido externo
 *
 * Todas las fuentes de contenido no-Supabase se normalizan a estos tipos
 * antes de llegar a cualquier componente UI o store. El reproductor futuro
 * recibirá un `ExternalTrack` y sabrá cómo manejarlo según `source`.
 *
 * Diseño deliberado:
 * - ExternalTrack NO extiende Track de Supabase — son mundos distintos.
 *   Track tiene campos de DB (id UUID, artist_id FK, album_id FK...) que
 *   no existen en fuentes externas. Mezclarlos crearía un tipo lleno de
 *   "string | null" sin sentido real.
 * - El reproductor (Parte 3) tendrá una unión: `PlayableItem = Track | ExternalTrack`
 *   y manejará cada caso según `source`.
 */

/** Identificador de la fuente de contenido. */
export type ContentSource = "vooxie" | "audius" | "youtube";

/**
 * Artwork en múltiples resoluciones. Siempre pedimos la más pequeña
 * disponible para listas (thumbnail) y la grande para el player full.
 */
export type ExternalArtwork = {
  /** Resolución pequeña — para listas, MiniPlayer (~150px). */
  thumbnail: string;
  /** Resolución grande — para player completo, álbum detail (~500px). */
  large: string | null;
};

/**
 * Artista de una fuente externa normalizado.
 * Para Audius: `user` del API.
 * Para YouTube: `channelTitle` del snippet.
 */
export type ExternalArtist = {
  source: ContentSource;
  /** ID único dentro de la fuente (hash de Audius, channelId de YouTube). */
  externalId: string;
  name: string;
  handle: string | null;      // @handle en Audius; null en YouTube
  avatarUrl: string | null;
  verified: boolean;
  followerCount: number | null;
  trackCount: number | null;
};

/**
 * Track/Video de una fuente externa normalizado.
 *
 * `streamRef` es la referencia que el reproductor necesitará:
 * - Audius: URL directa del stream (`/v1/tracks/{id}/stream?app_name=...`)
 *   → expo-audio la reproduce directamente (sigue el 302 redirect).
 * - YouTube: videoId (`dQw4w9WgXcQ`)
 *   → en Parte 3 se abrirá con react-native-youtube-iframe o WebView embed.
 *
 * NO guardamos el audio descargado ni intentamos extraerlo.
 */
export type ExternalTrack = {
  source: ContentSource;
  /** ID único dentro de la fuente. */
  externalId: string;
  title: string;
  artist: Pick<ExternalArtist, "externalId" | "name" | "handle">;
  artwork: ExternalArtwork | null;
  /** Duración en segundos. null si la fuente no la provee en búsqueda. */
  durationSeconds: number | null;
  genre: string | null;
  isExplicit: boolean;
  /**
   * Referencia para reproducción futura.
   * - Audius: URL de stream (`https://host/v1/tracks/{id}/stream?app_name=...`)
   * - YouTube: videoId puro (id del track; el audio se reproduce desde `streamUrl`)
   */
  streamRef: string;
  /** Cantidad de reproducciones según la fuente. null si no disponible. */
  playCount: number | null;

  // ── Campos de tracks resueltos (YouTube vía yt-dlp). Opcionales para no
  //    romper Audius ni favoritos ya persistidos. Ver `UnifiedTrack`. ──
  /** URL de audio reproducible (TEMPORAL). null/ausente = aún sin resolver. */
  streamUrl?: string | null;
  /** ISO-8601. Cuando vence `streamUrl`. */
  streamExpiresAt?: string | null;
  /** Video corto (Canvas) asociado por `youtube_id`. */
  canvasUrl?: string | null;
  /** Productores. `[]` si no se conocen (nunca se inventan). */
  producers?: string[];

  // ── Canciones de catálogo (Deezer): metadata oficial; el audio se empareja en YouTube ──
  /** Id de Deezer. Si existe, `externalId` es `dz:<id>` y el youtube_id se resuelve al reproducir. */
  deezerId?: number | null;
  isrc?: string | null;
  /** youtube_id ya emparejado (null/ausente hasta resolver). */
  youtubeId?: string | null;
  albumTitle?: string | null;
};

/**
 * Modelo central de un track de YouTube resuelto por el pipeline
 * búsqueda → caché → yt-dlp. Es la forma "limpia" que devuelven
 * `unifiedSearch()` y `resolveTrack()`.
 *
 * metadata = permanente · streamUrl/streamExpiresAt = temporal.
 * Se adapta al `ExternalTrack` existente con `unifiedToExternalTrack()`
 * (mapper.ts) — no hay un segundo modelo incompatible: ExternalTrack es el
 * contenedor de UI/player y UnifiedTrack el contrato de datos.
 */
export interface UnifiedTrack {
  /** youtube_id (videoId de 11 caracteres). */
  id: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  streamUrl: string | null;
  duration: number | null;
  canvasUrl: string | null;
  producers: string[];
  source: "youtube";
  streamExpiresAt: string | null;
}

/** Álbum/playlist de una fuente externa. */
export type ExternalAlbum = {
  source: ContentSource;
  externalId: string;
  title: string;
  artist: Pick<ExternalArtist, "externalId" | "name">;
  artwork: ExternalArtwork | null;
  trackCount: number | null;
  releaseDate: string | null;   // ISO date string o partial ("2024")
  /** Álbum / EP / sencillo (solo catálogo Deezer). */
  albumType?: "album" | "ep" | "single" | "compilation";
};

/**
 * Resultados de búsqueda normalizados de una fuente externa.
 * Mismo shape que `SearchResults` de Supabase para que la UI pueda
 * manejarlos con el mismo patrón en Parte 2.
 */
export type ExternalSearchResults = {
  source: ContentSource;
  tracks: ExternalTrack[];
  artists: ExternalArtist[];
  albums: ExternalAlbum[];
};

/** Resultado genérico para operaciones de servicio externo. */
export type ExternalResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; code?: ExternalErrorCode };

export type ExternalErrorCode =
  | "network_error"      // Sin conexión o timeout
  | "not_found"          // ID no existe en la fuente
  | "rate_limited"       // Demasiadas peticiones
  | "auth_error"         // API key inválida (YouTube)
  | "unavailable"        // Servicio caído (todos los nodos Audius down)
  | "invalid_response"   // La respuesta no tiene el formato esperado
  | "proxy_error"        // Error en nuestra Edge Function (YouTube)
  | "timeout"            // La Edge Function / yt-dlp excedió el tiempo
  | "stream_failed";     // No se pudo resolver un stream de audio

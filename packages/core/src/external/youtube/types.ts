/**
 * Tipos de las respuestas del pipeline YouTube
 * (Edge Function `youtube-proxy` ⇄ microservicio yt-dlp).
 */

/** Códigos de error estructurados que devuelven la Edge Function y el servicio. */
export type YouTubeProxyErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "TRACK_NOT_FOUND"
  | "SEARCH_FAILED"
  | "EXTRACT_FAILED"
  | "STREAM_RESOLUTION_FAILED"
  | "STREAM_EXPIRED"
  | "UPSTREAM_TIMEOUT"
  | "CACHE_ERROR";

export interface YouTubeProxyErrorBody {
  success: false;
  code: YouTubeProxyErrorCode;
  message: string;
}

/** Item de búsqueda (sin stream). */
export interface YouTubeSearchItem {
  videoId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  duration: number | null;
}

/** action: "search" */
export interface YouTubeSearchResponse {
  success: true;
  items: YouTubeSearchItem[];
}

/** Track tal como lo devuelve la Edge Function en `action: "resolve"`. */
export interface YouTubeExtractResponse {
  videoId: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
  duration: number | null;
  streamUrl: string | null;
  streamExpiresAt: string | null;
  canvasUrl: string | null;
  producers: string[];
}

/** action: "resolve" */
export interface YouTubeResolveResponse {
  success: true;
  cache: "hit" | "refreshed" | "miss";
  track: YouTubeExtractResponse;
}

export type YouTubeProxyResponse =
  | YouTubeSearchResponse
  | YouTubeResolveResponse
  | YouTubeProxyErrorBody;

export type YouTubeProxyRequest =
  | { action: "search"; query: string }
  | { action: "resolve"; videoId: string; staleStreamUrl?: string }
  | {
      action: "resolve_match";
      artist: string;
      title: string;
      duration?: number;
      deezerId?: number;
      artworkUrl?: string;
      staleStreamUrl?: string;
    };

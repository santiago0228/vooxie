/**
 * Política pura del TrackResolver (sin React): decide QUÉ hacer ante el estado
 * actual. Está separada para poder probarla y para garantizar que NUNCA entra
 * en un bucle de reintentos contra la Edge Function.
 */

export const MAX_FORCED_REFRESHES = 2;

export type ResolverInput = {
  /** Id del track actual (null si no hay). */
  id: string | null;
  isYouTube: boolean;
  /** El track no tiene un stream válido (falta o expiró). */
  needsStream: boolean;
  /** Error de reproducción reportado por el engine para ESTE track. */
  error: { streamUrl: string | null; manual?: boolean } | null;
  /** Ya falló la resolución de este id y el usuario no ha reintentado. */
  failed: boolean;
  /** Renovaciones forzadas ya hechas para este id. */
  forcedCount: number;
};

export type ResolverPlan =
  | { type: "none" }
  | { type: "give_up" }
  | { type: "resolve"; stale: string | null; forced: boolean };

export function planResolve(i: ResolverInput): ResolverPlan {
  if (!i.id || !i.isYouTube) return { type: "none" };

  if (i.error) {
    // Reintento manual del usuario: siempre se intenta de nuevo.
    if (i.error.manual) return { type: "resolve", stale: i.error.streamUrl, forced: true };
    if (i.forcedCount >= MAX_FORCED_REFRESHES) return { type: "give_up" };
    return { type: "resolve", stale: i.error.streamUrl, forced: true };
  }

  if (!i.needsStream) return { type: "none" };
  // Falta stream: se resuelve una vez; si falló, se espera al reintento manual.
  if (i.failed) return { type: "none" };
  return { type: "resolve", stale: null, forced: false };
}

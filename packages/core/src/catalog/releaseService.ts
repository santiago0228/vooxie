import { supabase } from "../supabase/client";
import { uploadAlbumCover, uploadTrackAudio, UploadResult } from "../storage/uploadService";
import type { ReleaseDraft, DraftTrack } from "./useReleaseDraftStore";
import type { AuthResult } from "../auth/authService";
import type { Genre } from "./types";

export type ArtistRelease = {
  id: string;
  title: string;
  cover_url: string | null;
  release_date: string | null;
  created_at: string;
  trackCount: number;
};

// ─── Géneros ─────────────────────────────────────────────────────────────────

export async function listGenres(): Promise<Pick<Genre, "id" | "name">[]> {
  const { data, error } = await supabase
    .from("genres")
    .select("id, name")
    .order("name");
  if (error || !data) return [];
  return data;
}

// ─── Dashboard del artista ────────────────────────────────────────────────────

export async function getArtistReleases(artistId: string): Promise<ArtistRelease[]> {
  const { data, error } = await supabase
    .from("albums")
    .select("id, title, cover_url, release_date, created_at")
    .eq("artist_id", artistId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  // Cuenta de tracks por álbum
  const ids = data.map((a) => a.id);
  const { data: counts } = await supabase
    .from("tracks")
    .select("album_id")
    .in("album_id", ids)
    .eq("status", "published");

  const countMap: Record<string, number> = {};
  (counts ?? []).forEach((t) => {
    if (t.album_id) countMap[t.album_id] = (countMap[t.album_id] ?? 0) + 1;
  });

  return data.map((a) => ({ ...a, trackCount: countMap[a.id] ?? 0 }));
}

export async function getArtistTotalPlays(artistId: string): Promise<number> {
  const { data } = await supabase
    .from("tracks")
    .select("plays_count")
    .eq("artist_id", artistId)
    .eq("status", "published");
  return (data ?? []).reduce((acc, t) => acc + (t.plays_count ?? 0), 0);
}

// ─── Validación local antes de publicar (sección 18) ─────────────────────────

export type PublishValidationError = string[];

export function validateDraftForPublish(draft: ReleaseDraft): PublishValidationError {
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push("Falta el título del lanzamiento.");
  if (!draft.localCoverUri) errors.push("Falta la portada.");
  if (draft.tracks.length === 0) errors.push("Agrega al menos una canción.");
  draft.tracks.forEach((t, i) => {
    const n = draft.tracks.length > 1 ? ` (Pista ${i + 1})` : "";
    if (!t.title.trim()) errors.push(`Falta el título de la canción${n}.`);
    if (!t.localAudioUri) errors.push(`Falta el audio de la canción${n}.`);
    if (!t.localAudioFileName) errors.push(`Falta el archivo de audio de la canción${n}.`);
  });
  return errors;
}

// ─── Publicación atómica (sección 19) ─────────────────────────────────────────

export type PublishProgress =
  | { stage: "cover" }
  | { stage: "audio"; trackIndex: number; total: number }
  | { stage: "saving" }
  | { stage: "done"; albumId: string };

export type PublishOptions = {
  artistId: string;
  draft: ReleaseDraft;
  onProgress?: (p: PublishProgress) => void;
};

/**
 * Publicación atómica y segura (sección 19).
 *
 * Orden:
 *   1. Subir portada → obtener URL.
 *   2. Subir audio de cada pista → obtener URLs.
 *   3. Insertar álbum en Supabase.
 *   4. Insertar tracks (con audio_url ya reales, sin inventar nada).
 *   5. Insertar track_genres.
 *   6. Si cualquier paso 3-5 falla → eliminar el álbum recién creado
 *      (y sus tracks por CASCADE) para no dejar datos incompletos.
 *      Los archivos subidos al Storage quedan — Storage tiene su propia
 *      gestión; borrar archivos silenciosamente sin confirmación del
 *      usuario sería más destructivo que dejarlos (son bytes inocuos sin
 *      fila de DB apuntando a ellos).
 *
 * Devuelve error descriptivo exacto (no "Error genérico") para que la UI
 * pueda mostrárselo al artista y él pueda reintentar (sección 18/19).
 */
export async function publishRelease(
  opts: PublishOptions
): Promise<AuthResult<{ albumId: string }>> {
  const { artistId, draft, onProgress } = opts;

  // Paso 1: portada
  onProgress?.({ stage: "cover" });
  const coverResult: UploadResult = await uploadAlbumCover(artistId, draft.localCoverUri!);
  if (!coverResult.ok) {
    return { ok: false, message: `No se pudo subir la portada: ${coverResult.message}` };
  }
  const coverPublicUrl = coverResult.publicUrl;

  // Paso 2: audios (secuencial — Supabase Storage no requiere paralelismo forzado
  // y es más fácil reportar progreso por pista)
  const audioUrls: Record<string, string> = {};
  for (let i = 0; i < draft.tracks.length; i++) {
    const track = draft.tracks[i];
    onProgress?.({ stage: "audio", trackIndex: i, total: draft.tracks.length });
    const audioResult: UploadResult = await uploadTrackAudio(
      artistId,
      track.localAudioUri!,
      track.localAudioFileName!
    );
    if (!audioResult.ok) {
      const n = draft.tracks.length > 1 ? ` (Pista ${i + 1}: "${track.title}")` : "";
      return {
        ok: false,
        message: `No se pudo subir el audio${n}: ${audioResult.message}`,
      };
    }
    audioUrls[track.localId] = audioResult.publicUrl;
  }

  // Paso 3-5: escritura en DB
  onProgress?.({ stage: "saving" });

  // 3. Álbum
  const { data: albumData, error: albumError } = await supabase
    .from("albums")
    .insert({
      artist_id: artistId,
      title: draft.title.trim(),
      description: draft.description.trim() || null,
      cover_url: coverPublicUrl,
      release_date: draft.releaseDate,
    })
    .select("id")
    .single();

  if (albumError || !albumData) {
    return {
      ok: false,
      message: albumError?.message ?? "No se pudo crear el lanzamiento. Inténtalo de nuevo.",
    };
  }
  const albumId = albumData.id;

  // 4. Tracks
  const trackInserts = draft.tracks.map((t: DraftTrack) => ({
    album_id: albumId,
    artist_id: artistId,
    title: t.title.trim(),
    description: t.description.trim() || null,
    audio_url: audioUrls[t.localId],
    cover_url: coverPublicUrl,
    duration_seconds: t.localAudioDurationSeconds ?? 0,
    track_number: t.trackNumber,
    is_explicit: t.isExplicit,
    feats: t.feats.filter((f) => f.trim() !== ""),
    status: "published" as const,
  }));

  const { data: tracksData, error: tracksError } = await supabase
    .from("tracks")
    .insert(trackInserts)
    .select("id, track_number");

  if (tracksError || !tracksData) {
    // Limpieza: eliminar el álbum (tracks en CASCADE se limpian solos)
    await supabase.from("albums").delete().eq("id", albumId);
    return {
      ok: false,
      message: tracksError?.message ?? "No se pudieron guardar las canciones. Inténtalo de nuevo.",
    };
  }

  // 5. Géneros por track
  const genreInserts: Array<{ track_id: string; genre_id: string }> = [];
  tracksData.forEach((savedTrack) => {
    const draftTrack = draft.tracks.find((t) => t.trackNumber === savedTrack.track_number);
    if (draftTrack?.genreId) {
      genreInserts.push({ track_id: savedTrack.id, genre_id: draftTrack.genreId });
    }
  });

  if (genreInserts.length > 0) {
    const { error: genreError } = await supabase.from("track_genres").insert(genreInserts);
    if (genreError) {
      // Los géneros fallaron pero el lanzamiento ya está publicado y es válido
      // (el campo genre no es obligatorio según el schema). No revertimos
      // — el artista puede editar el género después. Solo lo registramos.
      console.warn("[releaseService] track_genres insert failed:", genreError.message);
    }
  }

  onProgress?.({ stage: "done", albumId });
  return { ok: true, data: { albumId } };
}

import { supabase } from "../supabase/client";
import { mapAuthError } from "./errors";
import type { AuthResult } from "./authService";
import type { ArtistProfile } from "../types/auth";

/**
 * Crea el artist_profiles del usuario autenticado. `verified` y
 * `public_stats_enabled` NUNCA se pasan desde aquí — el trigger
 * protect_artist_verified() (migración 0002) los ignora si igual se
 * intentaran mandar, pero además ni siquiera los exponemos en el input
 * para que quede claro que no son parte de este flujo.
 */
export async function createArtistProfile(input: {
  userId: string;
  displayName: string;
  bio?: string;
}): Promise<AuthResult<ArtistProfile>> {
  const displayName = input.displayName.trim();
  if (!displayName) {
    return { ok: false, message: "El nombre de artista es obligatorio." };
  }

  const { data, error } = await supabase
    .from("artist_profiles")
    .insert({
      user_id: input.userId,
      display_name: displayName,
      bio: input.bio?.trim() || null,
    })
    .select()
    .single();

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("duplicate key")) {
      return { ok: false, message: "Ya tienes un perfil de artista." };
    }
    return { ok: false, message: mapAuthError(error) };
  }

  return { ok: true, data };
}

/**
 * Actualiza (o elimina, pasando null) la foto de perfil del artista.
 * La subida real del archivo al bucket artist-images pasa por
 * `uploadArtistAvatar` (storage/uploadService.ts) — esta función solo
 * guarda la URL resultante en artist_profiles.avatar_url.
 */
export async function updateArtistAvatar(
  artistId: string,
  avatarUrl: string | null
): Promise<AuthResult<ArtistProfile>> {
  const { data, error } = await supabase
    .from("artist_profiles")
    .update({ avatar_url: avatarUrl })
    .eq("id", artistId)
    .select()
    .single();

  if (error) {
    return { ok: false, message: mapAuthError(error) };
  }
  return { ok: true, data };
}

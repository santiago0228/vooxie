import { create } from "zustand";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import type { AuthStatus, Profile, ArtistProfile } from "../types/auth";

export type AuthState = {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  /** null = todavía no se determinó / no tiene perfil de artista. */
  artistProfile: ArtistProfile | null;
  /**
   * Se inicializa una sola vez por ciclo de vida de la app (desde el
   * _layout raíz). Idempotente: si ya se llamó, no vuelve a suscribirse.
   */
  init: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

let subscribed = false;

async function loadProfileData(userId: string) {
  const [{ data: profile }, { data: artistProfile }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase
      .from("artist_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return { profile: profile ?? null, artistProfile: artistProfile ?? null };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: "loading",
  session: null,
  profile: null,
  artistProfile: null,

  init: async () => {
    // getSession() restaura la sesión persistida (AsyncStorage) si existe.
    const { data } = await supabase.auth.getSession();

    if (data.session) {
      const { profile, artistProfile } = await loadProfileData(
        data.session.user.id
      );
      set({
        status: "signedIn",
        session: data.session,
        profile,
        artistProfile,
      });
    } else {
      set({ status: "signedOut", session: null, profile: null, artistProfile: null });
    }

    if (subscribed) return;
    subscribed = true;

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        const { profile, artistProfile } = await loadProfileData(
          session.user.id
        );
        set({ status: "signedIn", session, profile, artistProfile });
      } else if (event === "SIGNED_OUT") {
        set({
          status: "signedOut",
          session: null,
          profile: null,
          artistProfile: null,
        });
      } else if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        set({ session });
      }
      // PASSWORD_RECOVERY: deliberadamente no cambia `status` a signedIn —
      // la sesión temporal de recuperación se maneja aparte en la pantalla
      // de reset-password (deepLinks.ts + authService.updatePassword),
      // para no dejar al usuario "adentro" de la app solo por abrir el link.
    });
  },

  refreshProfile: async () => {
    const session = get().session;
    if (!session) return;
    const { profile, artistProfile } = await loadProfileData(session.user.id);
    set({ profile, artistProfile });
  },
}));

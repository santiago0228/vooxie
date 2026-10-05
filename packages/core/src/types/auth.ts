import type { Database } from "../supabase/types.generated";

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type ArtistProfile =
  Database["public"]["Tables"]["artist_profiles"]["Row"];

export type AuthStatus =
  | "loading" // determinando si hay sesión — evita flashes de login/home
  | "signedOut"
  | "signedIn";

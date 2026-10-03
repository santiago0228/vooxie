import { supabase } from "../supabase/client";

export type AuthDeepLinkResult =
  | { type: "recovery"; ok: boolean; message?: string }
  | { type: "none" };

/**
 * Se llama con la URL que abrió la app (desde expo-linking, tanto en frío
 * -Linking.getInitialURL()- como en caliente -evento 'url'-).
 *
 * Con flowType: 'pkce' (ver supabase/client.ts), el link de recuperación
 * trae un `?code=...` en vez de tokens en el fragmento. exchangeCodeForSession
 * establece una sesión temporal válida solo para poder llamar
 * updatePassword() a continuación (authService.ts).
 */
export async function handleAuthDeepLink(
  url: string
): Promise<AuthDeepLinkResult> {
  if (!url.includes("reset-password")) {
    return { type: "none" };
  }

  const { error } = await supabase.auth.exchangeCodeForSession(url);

  if (error) {
    return {
      type: "recovery",
      ok: false,
      message: "El enlace de recuperación no es válido o ya expiró.",
    };
  }

  return { type: "recovery", ok: true };
}

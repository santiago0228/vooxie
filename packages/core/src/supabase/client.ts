import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";
import type { Database } from "./types.generated";

/**
 * Cliente único de Supabase, usado por ambas apps (vooxie y vooxie-artistas).
 * Las variables SUPABASE_URL y SUPABASE_ANON_KEY vienen de app.config.ts -> extra,
 * que a su vez las toma de .env (ver .env.example en la raíz).
 *
 * IMPORTANTE: nunca usar la service_role key aquí. Esta app solo debe usar
 * la anon key pública + RLS. Las operaciones privilegiadas van en Edge Functions.
 */

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl as string;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Faltan SUPABASE_URL o SUPABASE_ANON_KEY. Revisa tu .env y app.config.ts."
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    // PKCE es el flujo correcto para apps nativas (no web): el link de
    // recuperación de contraseña trae un `code` que se intercambia por
    // sesión desde el cliente vía exchangeCodeForSession(), en vez de
    // depender de detectar tokens en la URL del navegador.
    flowType: "pkce",
  },
});

// Recomendación oficial de Supabase para React Native: sin esto,
// autoRefreshToken sigue intentando refrescar el token de sesión aunque la
// app esté en segundo plano, gastando batería/red innecesariamente y
// pudiendo generar llamadas de refresh fallidas.
// https://supabase.com/docs/reference/javascript/initializing (sección RN)
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

import "dotenv/config";
import { ExpoConfig, ConfigContext } from "expo/config";

/**
 * Esta app requiere un Development Build (EAS o `expo run:*`), no Expo Go:
 * expo-audio con reproducción en segundo plano necesita configuración nativa.
 *
 * Variables:
 *  - EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY → públicas (van al bundle).
 *  - YTDLP_SERVICE_URL / YTDLP_SERVICE_TOKEN → SECRETOS de Supabase. Nunca aquí.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "VooXiE",
  slug: "vooxie",
  scheme: "vooxie",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  assetBundlePatterns: ["**/*"],
  ios: {
    bundleIdentifier: "com.vooxie.app",
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ["audio"], // reproducción en segundo plano
    },
  },
  android: {
    package: "com.vooxie.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0A0A0B",
    },
  },
  plugins: [
    "expo-router",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash.png",
        resizeMode: "contain",
        backgroundColor: "#0A0A0B",
      },
    ],
    [
      "expo-audio",
      {
        enableBackgroundPlayback: true,
        // La app solo reproduce: no pedimos micrófono ni RECORD_AUDIO.
        microphonePermission: false,
        recordAudioAndroid: false,
      },
    ],
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    supabaseAnonKey:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY,
    webDomain: process.env.VOOXIE_WEB_DOMAIN,
    AUDIUS_APP_NAME: "VOOXIE",
    // Si owner / projectId están definidos en tu cuenta EAS, ponlos vía `eas init`.
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
});

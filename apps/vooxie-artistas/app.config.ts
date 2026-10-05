import "dotenv/config";
import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "VooXiE Artistas",
  slug: "vooxie-artistas",
  scheme: "vooxie-artistas",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  icon: "./assets/icon.png",
  assetBundlePatterns: ["**/*"],
  ios: {
    bundleIdentifier: "com.vooxie.artistas",
    supportsTablet: false,
  },
  android: {
    package: "com.vooxie.artistas",
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
      { enableBackgroundPlayback: false, microphonePermission: false, recordAudioAndroid: false },
    ],
    "expo-document-picker",
    "expo-image-picker",
  ],
  extra: {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL,
    supabaseAnonKey:
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY,
    webDomain: process.env.VOOXIE_WEB_DOMAIN,
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
});

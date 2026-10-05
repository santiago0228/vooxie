import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { TrackActionsSheet } from "../src/library/TrackActionsSheet";
import { Toast } from "../src/library/Toast";
import { Stack, useRouter, useSegments } from "expo-router";
import * as Linking from "expo-linking";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "@vooxie/ui";
import {
  useAuthStore,
  handleAuthDeepLink,
  AudioEngine,
  TrackResolver,
  useLibraryStore,
  TrackPrefetcher,
  useFavoritesStore,
} from "@vooxie/core";

function AuthGate({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const status = useAuthStore((s) => s.status);
  const init = useAuthStore((s) => s.init);
  const segments = useSegments();
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    init().finally(() => setInitialized(true));
  }, [init]);

  // Deep link de recuperación de contraseña — en frío y en caliente.
  useEffect(() => {
    const go = (url: string | null) => {
      if (!url) return;
      handleAuthDeepLink(url).then((result) => {
        if (result.type === "recovery") {
          router.replace({
            pathname: "/(auth)/reset-password",
            params: result.ok ? {} : { error: result.message ?? "" },
          });
        }
      });
    };
    Linking.getInitialURL().then(go);
    const sub = Linking.addEventListener("url", (e) => go(e.url));
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (!initialized || status === "loading") return;

    const inAuthGroup = segments[0] === "(auth)";

    // Fase 2: exploración sin cuenta habilitada — ya NO se redirige a
    // login solo por estar signedOut. Cada pantalla que de verdad
    // necesita sesión (Biblioteca, Perfil, dar like) lo controla ella
    // misma. Lo único que sigue siendo automático acá es la dirección
    // inversa: si ya hay sesión, no tiene sentido quedarse en login/registro.
    if (status === "signedIn" && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [status, segments, initialized, router]);

  if (!initialized || status === "loading") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.background,
        }}
      >
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return <>{children}</>;
}

/**
 * Carga los favoritos del usuario al iniciar sesión y los limpia al cerrar
 * sesión — Fase 2. Componente separado, hermano de AuthGate (no toca su
 * lógica de Fase 1 en absoluto).
 */
function FavoritesSync() {
  const session = useAuthStore((s) => s.session);
  const load = useFavoritesStore((s) => s.load);
  const reset = useFavoritesStore((s) => s.reset);
  const loadLibrary = useLibraryStore((s) => s.load);
  const resetLibrary = useLibraryStore((s) => s.reset);

  useEffect(() => {
    if (session) {
      load(session.user.id);
      loadLibrary(session.user.id);
    } else {
      reset();
      resetLibrary();
    }
  }, [session, load, reset, loadLibrary, resetLibrary]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider mode="dark">
        <AuthGate>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="artist/[id]" />
            <Stack.Screen name="album/[id]" />
            <Stack.Screen name="playlist/[id]" />
            <Stack.Screen
              name="player/index"
              options={{ presentation: "modal" }}
            />
          </Stack>
        </AuthGate>
        {/* Reproducción — una sola instancia de cada uno, sobreviven la navegación.
            AudioEngine: único reproductor (expo-audio) — solo reproduce URLs de audio.
            TrackResolver: nivel superior que mantiene un stream válido para los
            tracks de YouTube (resolveTrack → youtube-proxy → yt-dlp). */}
        <AudioEngine />
        <TrackResolver />
        <TrackPrefetcher />
        <FavoritesSync />
        <TrackActionsSheet />
        <Toast />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

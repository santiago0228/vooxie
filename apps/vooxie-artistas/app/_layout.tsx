import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import * as Linking from "expo-linking";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "@vooxie/ui";
import { useAuthStore, handleAuthDeepLink } from "@vooxie/core";

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

    // A diferencia de VooXiE, aquí NO se decide el acceso por
    // "tiene artist_profile o no" a nivel de ruta — cualquier usuario
    // autenticado puede entrar a (app); (app)/index.tsx decide
    // internamente si mostrar "crear perfil de artista" o el dashboard.
    // Esto evita una ruta intermedia artificial solo para ese branching.
    if (status === "signedOut" && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (status === "signedIn" && inAuthGroup) {
      router.replace("/(app)");
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

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthGate>
          <Slot />
        </AuthGate>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

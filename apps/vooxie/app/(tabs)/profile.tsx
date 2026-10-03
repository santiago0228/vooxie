import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import {
  useTheme,
  Button,
  SignInPrompt,
  spacing,
  typography,
  useSafeSpacing,
} from "@vooxie/ui";
import { useAuthStore, signOut } from "@vooxie/core";

export default function ProfileScreen() {
  const { theme } = useTheme();
  const { top, bottom } = useSafeSpacing();
  const router = useRouter();
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  const artistProfile = useAuthStore((s) => s.artistProfile);
  const [loading, setLoading] = useState(false);

  async function onSignOut() {
    setLoading(true);
    await signOut();
    setLoading(false);
    // Ya no hay redirección automática a login (Fase 2: exploración sin
    // cuenta) — el usuario simplemente sigue en Perfil, que ahora
    // muestra el SignInPrompt de abajo al quedar sin sesión.
  }

  if (!session) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <SignInPrompt
          title="Iniciá sesión"
          description="Creá una cuenta o iniciá sesión para tener tu perfil, favoritos y más."
          onSignIn={() => router.push("/(auth)/login")}
        />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: top,
          paddingBottom: bottom,
        },
      ]}
    >
      <Text style={[styles.title, { color: theme.text }]}>
        {profile?.username ?? "Perfil"}
      </Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        {session?.user.email}
      </Text>

      {artistProfile ? (
        <Text
          style={[
            styles.body,
            { color: theme.textSecondary, marginTop: spacing.sm },
          ]}
        >
          También tienes una cuenta de artista ({artistProfile.display_name}) —
          gestiónala desde VooXiE Artistas.
        </Text>
      ) : null}

      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Ajustes completos (cuenta, reproducción, privacidad...) — pendiente de
        la Fase 12.
      </Text>

      <View style={{ height: spacing.xl }} />
      <Button
        label="Cerrar sesión"
        variant="secondary"
        onPress={onSignOut}
        loading={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: spacing.xl },
  title: { ...typography.displayMd },
  body: { ...typography.body, marginTop: spacing.xs },
  hint: { ...typography.caption, marginTop: spacing.xl },
});

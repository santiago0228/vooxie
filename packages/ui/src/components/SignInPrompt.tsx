import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, typography } from "../tokens/spacing";
import { Button } from "./Button";

type SignInPromptProps = {
  title: string;
  description?: string;
  onSignIn: () => void;
};

/**
 * Se usa cuando una pantalla/acción requiere cuenta y el usuario está
 * explorando VooXiE sin haber iniciado sesión (Fase 2, exploración libre).
 * `onSignIn` lo decide la app (navegar a /(auth)/login) — este componente
 * no depende de expo-router.
 */
export function SignInPrompt({ title, description, onSignIn }: SignInPromptProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Ionicons name="person-circle-outline" size={40} color={theme.textSecondary} />
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {description}
        </Text>
      ) : null}
      <View style={{ marginTop: spacing.lg, alignSelf: "stretch" }}>
        <Button label="Iniciar sesión" onPress={onSignIn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
  },
  title: { ...typography.title, textAlign: "center", marginTop: spacing.xs },
  description: { ...typography.body, textAlign: "center" },
});

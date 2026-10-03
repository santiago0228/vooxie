import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, typography } from "../tokens/spacing";
import { Button } from "./Button";

type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
};

/**
 * `message` debe ser siempre el texto ya traducido a español que devuelven
 * los servicios de packages/core (nunca un PostgrestError crudo) — ver
 * GENERIC_ERROR en catalogService.ts/favoritesService.ts.
 */
export function ErrorState({
  message = "No pudimos cargar este contenido.",
  onRetry,
}: ErrorStateProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={28} color={theme.textSecondary} />
      <Text style={[styles.message, { color: theme.textSecondary }]}>{message}</Text>
      {onRetry ? (
        <View style={{ marginTop: spacing.md }}>
          <Button label="Reintentar" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  message: { ...typography.body, textAlign: "center" },
});

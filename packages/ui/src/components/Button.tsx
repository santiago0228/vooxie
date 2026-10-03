import React from "react";
import { Pressable, Text, StyleSheet, ActivityIndicator } from "react-native";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, radius, typography } from "../tokens/spacing";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
};

/**
 * Botón base. El azul profundo (accent) se reserva para variant="primary".
 * No usar variant="primary" repetidamente en una misma pantalla — el acento
 * marca UNA acción principal por pantalla, no decora todo.
 *
 * Radio moderado (radius.md) en vez de pill: una forma más sobria/premium,
 * menos "app de consumo genérica".
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: ButtonProps) {
  const { theme } = useTheme();

  const backgroundColor =
    variant === "primary"
      ? theme.accent
      : variant === "secondary"
      ? theme.surfaceElevated
      : "transparent";

  const borderColor = variant === "secondary" ? theme.border : "transparent";
  const textColor = variant === "primary" ? "#FFFFFF" : theme.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor,
          borderColor,
          borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth * 2 : 0,
          opacity: disabled ? 0.4 : pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...typography.bodyStrong,
  },
});

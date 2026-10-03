import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, typography } from "../tokens/spacing";
import { Button } from "./Button";

type EmptyStateProps = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({
  icon = "musical-notes-outline",
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <Ionicons name={icon} size={32} color={theme.textSecondary} />
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {description ? (
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={{ marginTop: spacing.lg }}>
          <Button label={actionLabel} variant="secondary" onPress={onAction} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  title: { ...typography.bodyStrong, textAlign: "center", marginTop: spacing.xs },
  description: { ...typography.caption, textAlign: "center" },
});

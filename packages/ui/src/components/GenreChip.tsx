import React from "react";
import { Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, radius, typography } from "../tokens/spacing";

type GenreChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function GenreChip({ label, selected, onPress }: GenreChipProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.accent : theme.surfaceElevated,
          borderColor: selected ? theme.accent : theme.border,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: selected ? "#FFFFFF" : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: { ...typography.caption },
});

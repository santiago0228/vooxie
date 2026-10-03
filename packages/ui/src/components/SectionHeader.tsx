import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, typography } from "../tokens/spacing";

type SectionHeaderProps = {
  title: string;
  onSeeAll?: () => void;
};

export function SectionHeader({ title, onSeeAll }: SectionHeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={8}>
          <Text style={[styles.seeAll, { color: theme.accent }]}>Ver todo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  title: { ...typography.title },
  seeAll: { ...typography.caption },
});

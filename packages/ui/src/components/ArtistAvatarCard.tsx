import React from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, typography } from "../tokens/spacing";

type ArtistAvatarCardProps = {
  name: string;
  avatarUrl?: string | null;
  verified?: boolean;
  onPress?: () => void;
  size?: number;
};

export function ArtistAvatarCard({
  name,
  avatarUrl,
  verified,
  onPress,
  size = 84,
}: ArtistAvatarCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ width: size, alignItems: "center", opacity: pressed ? 0.8 : 1 }]}
    >
      <View
        style={[
          styles.avatar,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.surfaceElevated,
          },
        ]}
      >
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <Ionicons name="person" size={size * 0.4} color={theme.textSecondary} />
        )}
      </View>
      <View style={styles.nameRow}>
        <Text numberOfLines={1} style={[styles.name, { color: theme.text }]}>
          {name}
        </Text>
        {verified ? (
          <Ionicons name="checkmark-circle" size={13} color={theme.accent} />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: spacing.xs,
  },
  avatarImage: { width: "100%", height: "100%" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  name: { ...typography.caption },
});

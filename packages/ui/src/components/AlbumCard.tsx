import React from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, radius, typography } from "../tokens/spacing";

type AlbumCardProps = {
  title: string;
  artistName: string;
  coverUrl?: string | null;
  onPress?: () => void;
  size?: number;
};

export function AlbumCard({
  title,
  artistName,
  coverUrl,
  onPress,
  size = 128,
}: AlbumCardProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ width: size, opacity: pressed ? 0.8 : 1 }]}
    >
      <View
        style={[
          styles.cover,
          { width: size, height: size, backgroundColor: theme.surfaceElevated },
        ]}
      >
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.coverImage} />
        ) : (
          <Ionicons name="disc-outline" size={28} color={theme.textSecondary} />
        )}
      </View>
      <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
        {title}
      </Text>
      <Text numberOfLines={1} style={[styles.artist, { color: theme.textSecondary }]}>
        {artistName}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: {
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: spacing.xs,
  },
  coverImage: { width: "100%", height: "100%" },
  title: { ...typography.bodyStrong },
  artist: { ...typography.caption },
});

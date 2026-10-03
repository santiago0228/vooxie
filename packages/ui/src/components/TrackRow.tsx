import React from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, radius, typography } from "../tokens/spacing";

type TrackRowProps = {
  title: string;
  artistName: string;
  coverUrl?: string | null;
  durationSeconds?: number;
  isExplicit?: boolean;
  isFavorite?: boolean;
  isActive?: boolean; // es la canción cargada actualmente en el reproductor
  onPress?: () => void;
  onToggleFavorite?: () => void;
};

function formatDuration(totalSeconds?: number): string {
  if (!totalSeconds || totalSeconds <= 0) return "--:--";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TrackRow({
  title,
  artistName,
  coverUrl,
  durationSeconds,
  isExplicit,
  isFavorite,
  isActive,
  onPress,
  onToggleFavorite,
}: TrackRowProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={[styles.cover, { backgroundColor: theme.surfaceElevated }]}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.coverImage} />
        ) : (
          <Ionicons name="musical-note" size={18} color={theme.textSecondary} />
        )}
      </View>

      <View style={styles.info}>
        <Text
          numberOfLines={1}
          style={[
            styles.title,
            { color: isActive ? theme.accent : theme.text },
          ]}
        >
          {title}
          {isExplicit ? "  🅴" : ""}
        </Text>
        <Text numberOfLines={1} style={[styles.artist, { color: theme.textSecondary }]}>
          {artistName}
        </Text>
      </View>

      <Text style={[styles.duration, { color: theme.textSecondary }]}>
        {formatDuration(durationSeconds)}
      </Text>

      {onToggleFavorite ? (
        <Pressable onPress={onToggleFavorite} hitSlop={10} style={styles.favoriteButton}>
          <Ionicons
            name={isFavorite ? "heart" : "heart-outline"}
            size={18}
            color={isFavorite ? theme.accent : theme.textSecondary}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  cover: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverImage: { width: "100%", height: "100%" },
  info: { flex: 1, gap: 2 },
  title: { ...typography.bodyStrong },
  artist: { ...typography.caption },
  duration: { ...typography.caption },
  favoriteButton: { paddingLeft: spacing.xs },
});

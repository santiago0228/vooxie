/**
 * MiniPlayer — Fase 5 (corrección final)
 *
 * - Nunca fondo blanco: backgroundColor siempre oscuro
 * - Atmósfera derivada del color de la portada via prop atmBg
 * - Barra de progreso funcional
 * - Transición suave de color entre canciones con Animated
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { spacing, radius, typography } from "../tokens/spacing";

type MiniPlayerProps = {
  title: string;
  artistName: string;
  coverUrl?: string | null;
  isPlaying: boolean;
  isLoading?: boolean;
  positionSeconds?: number;
  durationSeconds?: number;
  /** Color de atmósfera derivado de la portada (opcional, default oscuro) */
  atmBg?: string;
  onTogglePlay: () => void;
  onPress: () => void;
};

export function MiniPlayer({
  title,
  artistName,
  coverUrl,
  isPlaying,
  isLoading,
  positionSeconds = 0,
  durationSeconds = 0,
  atmBg,
  onTogglePlay,
  onPress,
}: MiniPlayerProps) {
  const progress =
    durationSeconds > 0
      ? Math.min(positionSeconds / durationSeconds, 1)
      : 0;

  // Animación de color de fondo al cambiar de canción
  const bgColor = atmBg ?? "#111621";

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.container,
        { backgroundColor: bgColor, borderColor: "rgba(255,255,255,0.08)" },
      ]}
    >
      {/* Barra de progreso */}
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${progress * 100}%` },
          ]}
        />
      </View>

      <View style={styles.inner}>
        {/* Cover */}
        <View style={styles.cover}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.coverImage} />
          ) : (
            <Ionicons
              name="musical-note"
              size={15}
              color="rgba(255,255,255,0.45)"
            />
          )}
        </View>

        {/* Info */}
        <View style={styles.info}>
          <Text
            numberOfLines={1}
            style={styles.title}
          >
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={styles.artist}
          >
            {artistName}
          </Text>
        </View>

        {/* Play/Pause */}
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            onTogglePlay();
          }}
          hitSlop={14}
          style={styles.control}
        >
          <Ionicons
            name={
              isLoading
                ? "ellipsis-horizontal"
                : isPlaying
                ? "pause"
                : "play"
            }
            size={22}
            color="rgba(255,255,255,0.9)"
          />
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
    }),
  },
  progressTrack: {
    height: 2,
    width: "100%",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    gap: spacing.sm,
  },
  cover: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  coverImage: { width: "100%", height: "100%" },
  info: { flex: 1, gap: 2 },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.05,
  },
  artist: {
    fontSize: 11,
    color: "rgba(255,255,255,0.5)",
    fontWeight: "400",
  },
  control: { paddingHorizontal: spacing.xs },
});

import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, GestureResponderEvent, LayoutChangeEvent } from "react-native";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, typography } from "../tokens/spacing";

type PlaybackProgressBarProps = {
  positionSeconds: number;
  durationSeconds: number;
  onSeek: (seconds: number) => void;
};

function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "0:00";
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Seek por toque (no arrastre continuo) — alcance razonable para esta
 * fase. Preparado para reemplazarse por un gesto de arrastre más adelante
 * sin cambiar la API pública (positionSeconds/durationSeconds/onSeek).
 */
export function PlaybackProgressBar({
  positionSeconds,
  durationSeconds,
  onSeek,
}: PlaybackProgressBarProps) {
  const { theme } = useTheme();
  const [trackWidth, setTrackWidth] = useState(0);

  const progress = durationSeconds > 0 ? Math.min(positionSeconds / durationSeconds, 1) : 0;

  function handlePress(e: GestureResponderEvent) {
    if (!trackWidth || durationSeconds <= 0) return;
    const x = e.nativeEvent.locationX;
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    onSeek(ratio * durationSeconds);
  }

  function handleLayout(e: LayoutChangeEvent) {
    setTrackWidth(e.nativeEvent.layout.width);
  }

  return (
    <View>
      <Pressable onPress={handlePress} onLayout={handleLayout} hitSlop={8}>
        <View style={[styles.track, { backgroundColor: theme.surfaceElevated }]}>
          <View
            style={[
              styles.fill,
              { backgroundColor: theme.accent, width: `${progress * 100}%` },
            ]}
          />
        </View>
      </Pressable>
      <View style={styles.timeRow}>
        <Text style={[styles.time, { color: theme.textSecondary }]}>
          {formatTime(positionSeconds)}
        </Text>
        <Text style={[styles.time, { color: theme.textSecondary }]}>
          {formatTime(durationSeconds)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  fill: { height: "100%" },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  time: { ...typography.micro },
});

/**
 * PlayerMainControls — Shuffle | Prev | Play/Pause | Next | Repeat
 *
 * Lee shuffle y repeatMode del store global (estado real de reproducción).
 * El Play/Pause es el elemento central dominante (círculo blanco).
 */

import React from "react";
import { View, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { type PlayerState, usePlayerStore } from "@vooxie/core";

type Props = {
  isPlaying: boolean;
  isLoading: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  disableNext?: boolean;
  disablePrevious?: boolean;
  accentColor?: string;
  mutedColor?: string;
  // Mantenidos para compatibilidad pero ignorados (vienen del store)
  shuffleActive?: boolean;
  repeatMode?: "none" | "one" | "all";
  onToggleShuffle?: () => void;
  onCycleRepeat?: () => void;
};

export function PlayerMainControls({
  isPlaying,
  isLoading,
  onTogglePlay,
  onNext,
  onPrevious,
  disableNext,
  disablePrevious,
  accentColor = "rgba(255,255,255,0.85)",
  mutedColor = "rgba(255,255,255,0.35)",
}: Props) {
  // Leer del store para que los controles reflejen el estado real
  const shuffle = usePlayerStore((s: PlayerState) => s.shuffle);
  const repeatMode = usePlayerStore((s: PlayerState) => s.repeatMode);
  const setShuffle = usePlayerStore((s: PlayerState) => s.setShuffle);
  const setRepeatMode = usePlayerStore((s: PlayerState) => s.setRepeatMode);

  const repeatActive = repeatMode !== "none";

  // Icono de repeat con indicador de modo "one"
  const repeatIconName = "repeat-outline";

  return (
    <View style={styles.row}>
      {/* Shuffle */}
      <Pressable
        onPress={() => setShuffle(!shuffle)}
        hitSlop={14}
        style={styles.sideBtn}
      >
        <Ionicons
          name="shuffle"
          size={22}
          color={shuffle ? accentColor : mutedColor}
        />
        {shuffle && (
          <View style={[styles.dot, { backgroundColor: accentColor }]} />
        )}
      </Pressable>

      {/* Anterior */}
      <Pressable
        onPress={onPrevious}
        disabled={disablePrevious}
        hitSlop={14}
        style={{ opacity: disablePrevious ? 0.25 : 1 }}
      >
        <Ionicons
          name="play-skip-back"
          size={30}
          color="rgba(255,255,255,0.9)"
        />
      </Pressable>

      {/* Play/Pause — centro dominante */}
      <Pressable
        onPress={onTogglePlay}
        style={({ pressed }) => [styles.playBtn, { opacity: pressed ? 0.85 : 1 }]}
      >
        {isLoading ? (
          <ActivityIndicator color="#070A10" size="small" />
        ) : (
          <Ionicons
            name={isPlaying ? "pause" : "play"}
            size={32}
            color="#070A10"
            style={isPlaying ? undefined : { marginLeft: 3 }}
          />
        )}
      </Pressable>

      {/* Siguiente */}
      <Pressable
        onPress={onNext}
        disabled={disableNext}
        hitSlop={14}
        style={{ opacity: disableNext ? 0.25 : 1 }}
      >
        <Ionicons
          name="play-skip-forward"
          size={30}
          color="rgba(255,255,255,0.9)"
        />
      </Pressable>

      {/* Repeat */}
      <Pressable
        onPress={() => {
          setRepeatMode(
            repeatMode === "none" ? "all" : repeatMode === "all" ? "one" : "none"
          );
        }}
        hitSlop={14}
        style={styles.sideBtn}
      >
        <View>
          <Ionicons
            name={repeatIconName}
            size={22}
            color={repeatActive ? accentColor : mutedColor}
          />
          {repeatMode === "one" && (
            <View style={styles.oneLabel}>
              <Ionicons name="text-outline" size={7} color={accentColor} />
            </View>
          )}
        </View>
        {repeatActive && (
          <View style={[styles.dot, { backgroundColor: accentColor }]} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  sideBtn: {
    width: 36,
    alignItems: "center",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  oneLabel: {
    position: "absolute",
    bottom: -1,
    right: -3,
    backgroundColor: "transparent",
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
});

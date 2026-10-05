import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing } from "../tokens/spacing";

type PlayerControlsProps = {
  isPlaying: boolean;
  isLoading?: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrevious: () => void;
  disableNext?: boolean;
  disablePrevious?: boolean;
};

export function PlayerControls({
  isPlaying,
  isLoading,
  onTogglePlay,
  onNext,
  onPrevious,
  disableNext,
  disablePrevious,
}: PlayerControlsProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.row}>
      <Pressable
        onPress={onPrevious}
        disabled={disablePrevious}
        hitSlop={12}
        style={{ opacity: disablePrevious ? 0.3 : 1 }}
      >
        <Ionicons name="play-skip-back" size={28} color={theme.text} />
      </Pressable>

      <Pressable
        onPress={onTogglePlay}
        style={[styles.playButton, { backgroundColor: theme.accent }]}
      >
        <Ionicons
          name={isLoading ? "ellipsis-horizontal" : isPlaying ? "pause" : "play"}
          size={30}
          color="#FFFFFF"
        />
      </Pressable>

      <Pressable
        onPress={onNext}
        disabled={disableNext}
        hitSlop={12}
        style={{ opacity: disableNext ? 0.3 : 1 }}
      >
        <Ionicons name="play-skip-forward" size={28} color={theme.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxl,
  },
  playButton: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
});

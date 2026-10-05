import React from "react";
import { StyleSheet, View } from "react-native";

/** Barra fina de progreso del mini-reproductor. `progress` entre 0 y 1. */
export function MiniProgressBar({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${clamped * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 2, width: "100%", backgroundColor: "rgba(255,255,255,0.12)" },
  fill: { height: "100%", backgroundColor: "rgba(255,255,255,0.88)" },
});

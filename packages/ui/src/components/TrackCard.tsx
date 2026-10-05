import React, { useRef } from "react";
import { View, Text, Image, Pressable, Animated, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, radius, typography } from "../tokens/spacing";

type TrackCardProps = {
  title: string;
  subtitle: string;
  coverUrl?: string | null;
  onPress: () => void;
  size?: number;
};

/**
 * Card cuadrada con botón de play circular superpuesto en la esquina —
 * composición tomada de la referencia visual del Home (carruseles con
 * miniaturas grandes + play button), no una copia literal de ninguna app.
 */
export function TrackCard({ title, subtitle, coverUrl, onPress, size = 140 }: TrackCardProps) {
  const { theme } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  function onPressIn() {
    Animated.timing(scale, { toValue: 0.97, duration: 100, useNativeDriver: true }).start();
  }
  function onPressOut() {
    Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  }

  return (
    <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut} style={{ width: size }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <View
          style={[
            styles.cover,
            { width: size, height: size, backgroundColor: theme.surfaceElevated },
          ]}
        >
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.coverImage} />
          ) : (
            <Ionicons name="musical-notes-outline" size={28} color={theme.textSecondary} />
          )}
          <View style={[styles.playButton, { backgroundColor: theme.accent }]}>
            <Ionicons name="play" size={16} color="#FFFFFF" />
          </View>
        </View>
      </Animated.View>
      <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
        {title}
      </Text>
      <Text numberOfLines={1} style={[styles.subtitle, { color: theme.textSecondary }]}>
        {subtitle}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cover: {
    borderRadius: radius.md,
    overflow: "hidden",
    marginBottom: spacing.xs,
  },
  coverImage: { width: "100%", height: "100%", position: "absolute" },
  playButton: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.sm,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...typography.bodyStrong },
  subtitle: { ...typography.caption },
});

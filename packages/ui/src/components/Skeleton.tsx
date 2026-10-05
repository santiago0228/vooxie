import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, ViewStyle } from "react-native";
import { useTheme } from "../tokens/ThemeProvider";
import { radius } from "../tokens/spacing";

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = radius.sm,
  style,
}: SkeletonProps) {
  const { theme } = useTheme();
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius,
          backgroundColor: theme.surfaceElevated,
          opacity,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { overflow: "hidden" },
});

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useToastStore } from "./useToastStore";

/** Aviso breve (2.4 s) que aparece sobre la barra inferior. */
export function Toast() {
  const message = useToastStore((s) => s.message);
  const id = useToastStore((s) => s.id);
  const hide = useToastStore((s) => s.hide);
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
        if (finished) hide();
      });
    }, 2400);
    return () => clearTimeout(t);
  }, [message, id, opacity, hide]);

  if (!message) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 150 }]}>
      <Animated.View style={[styles.toast, { opacity }]}>
        <Text style={styles.text}>{message}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 999 },
  toast: { backgroundColor: "rgba(40,44,56,0.96)", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 14, maxWidth: "88%" },
  text: { color: "#fff", fontSize: 14, fontWeight: "600" },
});

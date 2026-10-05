/**
 * AudioOutputCard — tarjeta elegante de dispositivo de audio.
 *
 * No real Bluetooth API (requiere módulo nativo). Esta tarjeta
 * renderiza la UI propuesta del brief usando el estado que le llegue.
 * Para conectar a Bluetooth real en producción: usar expo-audio o
 * react-native-bluetooth-state-manager.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  deviceName?: string | null;
  codec?: string | null;
  connected?: boolean;
  onPress?: () => void;
  bgColor?: string;
  textColor?: string;
  mutedColor?: string;
};

export function AudioOutputCard({
  deviceName,
  codec,
  connected = true,
  onPress,
  bgColor = "rgba(255,255,255,0.06)",
  textColor = "rgba(255,255,255,0.9)",
  mutedColor = "rgba(255,255,255,0.45)",
}: Props) {
  if (!deviceName) return null;

  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { backgroundColor: bgColor }]}
      android_ripple={{ color: "rgba(255,255,255,0.05)" }}
    >
      {/* Icono Bluetooth personalizado (no el típico símbolo) */}
      <View style={styles.iconWrap}>
        <Ionicons name="radio-outline" size={16} color={textColor} />
      </View>

      <View style={styles.info}>
        <Text style={[styles.name, { color: textColor }]} numberOfLines={1}>
          {deviceName}
        </Text>
        <Text style={[styles.status, { color: mutedColor }]}>
          {connected ? "Conectado" : "Desconectado"}
          {codec ? ` · ${codec}` : ""}
        </Text>
      </View>

      <Ionicons name="chevron-down" size={14} color={mutedColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  info: { flex: 1 },
  name: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  status: {
    fontSize: 11,
    marginTop: 1,
    fontWeight: "400",
  },
});

/**
 * PlayerActionBar — Créditos · Cola · Letra.
 * Tres "fichas" de vidrio (degradado translúcido + borde fino), con icono relleno arriba y
 * etiqueta abajo; se oscurecen al presionar. Se integran con el fondo de la portada.
 */
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

type Item = { key: string; label: string; icon: IconName; onPress: () => void; badge?: string | null };

function Tile({ item }: { item: Item }) {
  return (
    <Pressable
      onPress={item.onPress}
      style={({ pressed }) => [styles.tileWrap, pressed && { transform: [{ scale: 0.97 }], opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <LinearGradient
        colors={["rgba(255,255,255,0.20)", "rgba(255,255,255,0.06)"]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.tile}
      >
        <View style={styles.iconWrap}>
          <Ionicons name={item.icon} size={22} color="#fff" />
          {item.badge ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.badge}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.label}>{item.label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function PlayerActionBar({
  onCredits,
  onQueue,
  onLyrics,
  queueCount,
}: {
  onCredits: () => void;
  onQueue: () => void;
  onLyrics: () => void;
  queueCount?: number;
}) {
  const items: Item[] = [
    { key: "credits", label: "Créditos", icon: "people", onPress: onCredits },
    { key: "queue", label: "Cola", icon: "layers", onPress: onQueue, badge: queueCount && queueCount > 1 ? String(Math.min(queueCount, 99)) : null },
    { key: "lyrics", label: "Letra", icon: "chatbox-ellipses", onPress: onLyrics },
  ];
  return (
    <View style={styles.row}>
      {items.map((i) => (
        <Tile key={i.key} item={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 10 },
  tileWrap: { flex: 1 },
  tile: {
    borderRadius: 20,
    paddingVertical: 14,
    alignItems: "center",
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
  },
  iconWrap: { width: 30, height: 26, alignItems: "center", justifyContent: "center" },
  badge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: "rgba(255,255,255,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#0B0E14", fontSize: 10, fontWeight: "800" },
  label: { color: "rgba(255,255,255,0.92)", fontSize: 12.5, fontWeight: "600", letterSpacing: 0.2 },
});

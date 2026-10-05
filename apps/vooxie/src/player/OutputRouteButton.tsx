/**
 * OutputRouteButton — elegir dónde suena la música (Bluetooth, AirPlay, altavoces).
 *
 *  · iOS:     selector nativo del sistema (AVRoutePickerView, vía expo-video). Muestra y cambia
 *             entre auriculares/altavoces Bluetooth y dispositivos AirPlay; el icono cambia de
 *             color cuando hay una salida externa activa.
 *  · Android: abre los ajustes de Bluetooth del sistema (no existe un selector nativo común).
 */
import React from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { VideoAirPlayButton } from "expo-video";

export function OutputRouteButton({ size = 28, tint = "rgba(255,255,255,0.85)" }: { size?: number; tint?: string }) {
  if (Platform.OS === "ios") {
    return (
      <View style={{ width: size, height: size }} accessibilityLabel="Salida de audio">
        <VideoAirPlayButton tint={tint} activeTint="#7CC4FF" style={{ width: size, height: size }} />
      </View>
    );
  }
  return (
    <Pressable
      hitSlop={10}
      accessibilityLabel="Salida de audio"
      onPress={() => {
        Linking.sendIntent("android.settings.BLUETOOTH_SETTINGS").catch(() => Linking.openSettings().catch(() => {}));
      }}
      style={[styles.android, { width: size, height: size }]}
    >
      <Ionicons name="bluetooth" size={size * 0.82} color={tint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  android: { alignItems: "center", justifyContent: "center" },
});

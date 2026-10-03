/**
 * GradientBg — gradiente de fondo compatible sin expo-linear-gradient.
 *
 * Simula un gradiente vertical usando múltiples capas con opacidad.
 * Para un gradiente más preciso en producción, instalar expo-linear-gradient
 * y reemplazar este componente.
 */

import React from "react";
import { View, StyleSheet } from "react-native";

type Props = {
  colorTop: string;
  colorMid: string;
  colorBottom?: string;
  style?: object;
};

export function GradientBg({ colorTop, colorMid, colorBottom = "#000000", style }: Props) {
  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {/* Capa base */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colorTop }]} />
      {/* Capa intermedia con transparencia */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colorMid, opacity: 0.55, top: "30%" },
        ]}
      />
      {/* Capa inferior oscura */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colorBottom, opacity: 0.75, top: "60%" },
        ]}
      />
    </View>
  );
}

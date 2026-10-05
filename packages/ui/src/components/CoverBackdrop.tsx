/**
 * CoverBackdrop — fondo que toma sus colores de la portada.
 *
 * La portada se escala, se difumina y se oscurece con un degradado: así el fondo
 * SIEMPRE coincide con la canción (sin depender de extraer un color, que en
 * nativo/Expo Go no es fiable). Al cambiar de canción hace un fundido suave.
 *
 * Usos: pantalla del reproductor (portada, letra y canvas) y mini-reproductor.
 */

import React, { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

export type CoverBackdropProps = {
  uri?: string | null;
  /** "full": pantalla completa. "bar": franja pequeña (mini-reproductor). */
  variant?: "full" | "bar";
  /** Escala extra de la imagen (miniaturas de YouTube con barras negras). */
  zoom?: number;
  style?: StyleProp<ViewStyle>;
};

const BASE = "#06080D";

export function CoverBackdrop({ uri, variant = "full", zoom = 1, style }: CoverBackdropProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  // Fundido al cambiar de portada.
  useEffect(() => {
    opacity.setValue(0);
  }, [uri, opacity]);

  const blur = variant === "bar" ? 18 : Platform.OS === "ios" ? 60 : 25;
  const scale = (variant === "bar" ? 3 : 1.6) * zoom;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: BASE }, style]} pointerEvents="none">
      {uri ? (
        <Animated.Image
          key={uri}
          source={{ uri }}
          blurRadius={blur}
          resizeMode="cover"
          onLoad={() =>
            Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }).start()
          }
          style={[StyleSheet.absoluteFill, { opacity, transform: [{ scale }] }]}
        />
      ) : null}

      {variant === "full" ? (
        <LinearGradient
          // Arriba deja ver el color de la portada; abajo baja a casi negro (controles legibles).
          colors={["rgba(6,8,13,0.10)", "rgba(6,8,13,0.38)", "rgba(6,8,13,0.78)", "rgba(6,8,13,0.96)"]}
          locations={[0, 0.35, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <LinearGradient
          colors={["rgba(6,8,13,0.30)", "rgba(6,8,13,0.62)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      )}
    </View>
  );
}


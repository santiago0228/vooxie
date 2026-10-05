import React from "react";
import { View, Image, Text, StyleSheet } from "react-native";
import { spacing, typography } from "../tokens/spacing";
import { useTheme } from "../tokens/ThemeProvider";

// Asset oficial — trazo blanco sobre fondo transparente. NO redibujar, NO
// generar variantes: es el wordmark completo "VooXiE" tal como fue entregado.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const WORDMARK_SOURCE = require("../assets/vooxie-wordmark.png");

// Dimensiones reales del PNG original (810x153) — se usa para calcular el
// alto a partir del ancho deseado y así preservar la proporción exacta.
// Nunca fijar width/height por separado sin pasar por este cálculo.
const WORDMARK_ASPECT_RATIO = 810 / 153;

const WIDTH_BY_SIZE = {
  lg: 220, // pantalla de login — mayor presencia
  sm: 130, // registro/forgot/reset — más discreto
} as const;

type AuthWordmarkProps = {
  /**
   * Texto aparte del logo (NO forma parte del wordmark oficial, que solo
   * dice "VooXiE"). Se usa para distinguir VooXiE Artistas: ej. label="ARTISTAS".
   * Se renderiza como texto normal debajo del wordmark, nunca superpuesto
   * ni fusionado con la imagen.
   */
  label?: string;
  tagline?: string;
  size?: "lg" | "sm";
};

export function AuthWordmark({ label, tagline, size = "lg" }: AuthWordmarkProps) {
  const { theme } = useTheme();
  const width = WIDTH_BY_SIZE[size];
  const height = width / WORDMARK_ASPECT_RATIO;

  return (
    <View style={styles.container}>
      <Image
        source={WORDMARK_SOURCE}
        resizeMode="contain"
        style={{ width, height }}
        accessibilityRole="image"
        accessibilityLabel="VooXiE"
      />
      {label ? (
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {label.toUpperCase()}
        </Text>
      ) : null}
      {tagline ? (
        <Text style={[styles.tagline, { color: theme.textSecondary }]}>
          {tagline.toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", gap: spacing.xs },
  label: { ...typography.eyebrow, marginTop: spacing.xs },
  tagline: { ...typography.eyebrow },
});

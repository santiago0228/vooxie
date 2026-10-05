import React from "react";
import { Image, StyleSheet } from "react-native";

// Asset oficial — trazo blanco sobre fondo transparente. NO redibujar, NO
// generar variantes.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SYMBOL_SOURCE = require("../assets/vooxie-symbol.png");

// Dimensiones reales del PNG original (374x197) — igual que en AuthWordmark,
// el alto se deriva del ancho para nunca deformar el símbolo.
const SYMBOL_ASPECT_RATIO = 374 / 197;

type BrandSymbolProps = {
  /** Ancho deseado en px; el alto se calcula automáticamente. */
  size?: number;
};

/**
 * Símbolo compacto de VooXiE (el "infinito"), sin el wordmark. Pensado para
 * avatar/favicon/ícono — todavía NO está conectado como app icon real en
 * app.config.ts (eso es trabajo de una fase posterior, cuando se generen
 * los tamaños/formatos que exige cada plataforma). Este componente lo deja
 * listo para reutilizar en cualquier pantalla mientras tanto.
 */
export function BrandSymbol({ size = 32 }: BrandSymbolProps) {
  const width = size;
  const height = size / SYMBOL_ASPECT_RATIO;

  return (
    <Image
      source={SYMBOL_SOURCE}
      resizeMode="contain"
      style={StyleSheet.flatten([{ width, height }])}
      accessibilityRole="image"
      accessibilityLabel="VooXiE"
    />
  );
}

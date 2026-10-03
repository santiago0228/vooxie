export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  displayLg: { fontSize: 34, fontWeight: "700" as const },
  displayMd: { fontSize: 26, fontWeight: "700" as const },
  title: { fontSize: 20, fontWeight: "600" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  bodyStrong: { fontSize: 15, fontWeight: "600" as const },
  caption: { fontSize: 13, fontWeight: "400" as const },
  micro: { fontSize: 11, fontWeight: "500" as const },
  /** Wordmark de marca (placeholder de texto — ver AuthWordmark). Peso
   * liviano + tracking amplio en vez de bold: se lee premium, no "app
   * genérica". Usar SOLO para el nombre de marca, no para títulos de
   * pantalla normales (esos siguen usando displayLg/displayMd). */
  wordmark: { fontSize: 30, fontWeight: "300" as const, letterSpacing: 5 },
  /** Etiqueta corta en mayúsculas con tracking (taglines, "OYENTE"/"ARTISTA",
   * separadores de sección). Aplicar textTransform: "uppercase" en el uso. */
  eyebrow: { fontSize: 12, fontWeight: "600" as const, letterSpacing: 1.5 },
} as const;

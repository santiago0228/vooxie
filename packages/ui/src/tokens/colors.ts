/**
 * Tokens de color VooXiE.
 *
 * Identidad: fondo oscuro (con un leve matiz azulado, no negro neutro) +
 * azul profundo/marino como único acento de acción — nunca violeta, nunca
 * neón. El acento se usa con moderación (botones primarios, foco, estados
 * activos), no como color dominante de pantalla.
 *
 * `accentSoft` es un azul muy oscuro/desaturado para fondos sutiles o
 * estados seleccionados discretos — no es un "tint" brillante.
 */

export const palette = {
  black: "#070A10",
  nearBlack: "#0B0F17",
  surfaceDark: "#111621",
  surfaceDarkElevated: "#1A2130",
  white: "#FFFFFF",
  offWhite: "#F5F6F8",
  surfaceLight: "#EDEFF3",
  surfaceLightElevated: "#FFFFFF",
  grayText: "#8B93A3",
  grayTextLight: "#5B6472",
  border: "#212938",
  borderLight: "#E1E4EA",
  accent: "#2F4C81", // azul profundo — botones primarios, foco, activo, likes
  accentPressed: "#24395F",
  accentSoft: "#16233B", // fondo sutil / estado seleccionado discreto (solo tema oscuro)
  accentSoftLight: "#E7ECF5", // equivalente sutil para tema claro
  danger: "#E5484D",
  success: "#3FAE7A",
} as const;

export const darkTheme = {
  background: palette.black,
  surface: palette.surfaceDark,
  surfaceElevated: palette.surfaceDarkElevated,
  text: palette.white,
  textSecondary: palette.grayText,
  border: palette.border,
  accent: palette.accent,
  accentPressed: palette.accentPressed,
  accentSoft: palette.accentSoft,
  danger: palette.danger,
  success: palette.success,
} as const;

export const lightTheme = {
  background: palette.offWhite,
  surface: palette.surfaceLight,
  surfaceElevated: palette.surfaceLightElevated,
  text: palette.black,
  textSecondary: palette.grayTextLight,
  border: palette.borderLight,
  accent: palette.accent,
  accentPressed: palette.accentPressed,
  accentSoft: palette.accentSoftLight,
  danger: palette.danger,
  success: palette.success,
} as const;

export type Theme = {
  readonly [K in keyof typeof darkTheme]: string;
};

import React from "react";
import { View, StyleSheet } from "react-native";
import { useSafeSpacing } from "../hooks/useSafeSpacing";
import { spacing } from "../tokens/spacing";

type ScreenHeaderProps = {
  /** Ej: avatar/perfil, botón de volver. */
  left?: React.ReactNode;
  /** Ej: BrandSymbol, título de pantalla. */
  center?: React.ReactNode;
  /** Ej: acciones (buscar, ajustes, notificaciones). */
  right?: React.ReactNode;
};

/**
 * Header compartido por VooXiE y VooXiE Artistas — mismo patrón de
 * espaciado en las dos apps para que se sientan parte del mismo producto
 * (en vez de que cada una reinvente su propio cálculo de safe area).
 *
 * Reemplaza los `paddingTop: spacing.md/lg` fijos que había antes en cada
 * pantalla: acá el espacio superior se calcula desde el safe area real
 * del dispositivo (Dynamic Island, notch, status bar de Android...), no
 * desde un número que solo se veía bien en un modelo puntual.
 *
 * `left`/`right` reservan el mismo ancho aunque estén vacíos, así el
 * `center` queda siempre centrado de verdad (mismo truco que ya usaba el
 * Home de VooXiE con el `<View style={{ width: 34 }} />` a la derecha del
 * avatar, generalizado acá).
 */
export function ScreenHeader({ left, center, right }: ScreenHeaderProps) {
  const { top } = useSafeSpacing();

  return (
    <View style={[styles.row, { paddingTop: top }]}>
      <View style={styles.side}>{left}</View>
      <View style={styles.center}>{center}</View>
      <View style={[styles.side, styles.sideRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
    minHeight: 44,
  },
  side: {
    minWidth: 34,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  sideRight: {
    alignItems: "flex-end",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

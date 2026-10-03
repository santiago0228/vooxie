import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing } from "../tokens/spacing";

/**
 * Espaciado seguro compartido por VooXiE y VooXiE Artistas.
 *
 * Por qué existe: antes cada pantalla usaba un `paddingTop`/`paddingBottom`
 * fijo (spacing.md, spacing.lg...) sin considerar el safe area real del
 * dispositivo. Se veía bien en un iPhone puntual y mal en Dynamic
 * Island/notch/Android con status bar alta, o el contenido quedaba pegado
 * al Home Indicator.
 *
 * La regla de diseño es "el espacio justo que respira, no relleno extra":
 * se suma un margen pequeño y fijo (spacing.xs/sm) al inset real del
 * dispositivo, en vez de un valor grande fijo que ya incluía "a ojo" el
 * espacio de status bar de un solo teléfono.
 *
 * `top`/`bottom`: para headers y contenido que necesita respetar el borde.
 * `insets`: los valores crudos, para casos puntuales (p.ej. altura de un
 * bottom sheet o un botón flotante).
 */
export function useSafeSpacing() {
  const insets = useSafeAreaInsets();

  return {
    /** Espacio superior recomendado para headers (avatar, logo, título). */
    top: insets.top + spacing.xs,
    /** Espacio inferior recomendado para botones/CTAs pegados al fondo. */
    bottom: insets.bottom + spacing.sm,
    insets,
  };
}

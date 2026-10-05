import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { useTheme } from "../tokens/ThemeProvider";
import { useSafeSpacing } from "../hooks/useSafeSpacing";
import { spacing } from "../tokens/spacing";

type FormScreenProps = {
  children: React.ReactNode;
  /** Centra el contenido verticalmente (pantallas cortas: login, crear
   * perfil de artista). Si es false, el contenido fluye desde arriba
   * (formularios largos: crear lanzamiento, con varios campos). */
  centered?: boolean;
  contentStyle?: ViewStyle;
};

/**
 * Wrapper compartido para pantallas con formulario: mismo patrón que ya
 * usaban login.tsx, register.tsx y la creación de perfil de artista
 * (KeyboardAvoidingView + ScrollView), ahora centralizado y con safe area
 * real arriba/abajo en vez de padding fijo.
 *
 * Pensado también para las pantallas de Fase 3 (crear lanzamiento, subir
 * portada, subir audio, revisión, publicar): el teclado nunca tapa el
 * campo activo, y el botón de continuar/publicar al final del scroll
 * queda por encima del Home Indicator / barra de Android gracias al
 * `bottom` del safe area.
 */
export function FormScreen({ children, centered = true, contentStyle }: FormScreenProps) {
  const { theme } = useTheme();
  const { top, bottom } = useSafeSpacing();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? top : 0}
    >
      <ScrollView
        contentContainerStyle={[
          centered ? styles.centered : styles.stacked,
          { paddingTop: top, paddingBottom: bottom + spacing.xl },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  centered: { flexGrow: 1, justifyContent: "center", padding: spacing.xl },
  stacked: { flexGrow: 1, padding: spacing.xl },
});

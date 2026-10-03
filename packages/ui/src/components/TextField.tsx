import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, TextInputProps } from "react-native";
import { useTheme } from "../tokens/ThemeProvider";
import { spacing, radius, typography } from "../tokens/spacing";

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  /** Si es true, agrega el botón de mostrar/ocultar contraseña. */
  isPassword?: boolean;
};

export function TextField({
  label,
  error,
  isPassword = false,
  secureTextEntry,
  ...inputProps
}: TextFieldProps) {
  const { theme, isDark } = useTheme();
  const [hidden, setHidden] = useState(isPassword);
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {label.toUpperCase()}
      </Text>
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.surfaceElevated,
            borderColor: error ? theme.danger : focused ? theme.accent : theme.border,
          },
          // Foco sutil: sombra suave en vez de solo cambiar el borde — sin
          // glow brillante ni gradiente, coherente con "premium, sobrio".
          focused &&
            !error && {
              shadowColor: theme.accent,
              shadowOpacity: isDark ? 0.35 : 0.18,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 0 },
              elevation: 2,
            },
        ]}
      >
        <TextInput
          {...inputProps}
          secureTextEntry={isPassword ? hidden : secureTextEntry}
          onFocus={(e) => {
            setFocused(true);
            inputProps.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            inputProps.onBlur?.(e);
          }}
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { color: theme.text }]}
        />
        {isPassword && (
          <Pressable onPress={() => setHidden((h) => !h)} hitSlop={8}>
            <Text style={[styles.toggle, { color: theme.accent }]}>
              {hidden ? "MOSTRAR" : "OCULTAR"}
            </Text>
          </Pressable>
        )}
      </View>
      {error ? (
        <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  label: { ...typography.eyebrow },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    ...typography.body,
  },
  toggle: { ...typography.eyebrow },
  error: { ...typography.caption },
});

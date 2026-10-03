import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Link } from "expo-router";
import {
  useTheme,
  Button,
  TextField,
  AuthWordmark,
  FormScreen,
  spacing,
  typography,
} from "@vooxie/ui";
import { signIn } from "@vooxie/core";

export default function LoginScreen() {
  const { theme } = useTheme();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function onSubmit() {
    setFormError(null);
    if (!identifier.trim() || !password) {
      setFormError("Completa correo/usuario y contraseña.");
      return;
    }
    setLoading(true);
    const result = await signIn({ identifier, password });
    setLoading(false);
    if (!result.ok) setFormError(result.message);
  }

  return (
    <FormScreen>
      <AuthWordmark
        label="Artistas"
        tagline="Gestiona tu música y tu audiencia"
      />

      <View style={{ height: spacing.xxxl }} />

      <TextField
        label="Correo electrónico o usuario"
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />
      <View style={{ height: spacing.md }} />
      <TextField
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        isPassword
      />

      {formError ? (
        <Text style={[styles.formError, { color: theme.danger }]}>
          {formError}
        </Text>
      ) : null}

      <View style={{ height: spacing.xl }} />
      <Button label="Iniciar sesión" onPress={onSubmit} loading={loading} />

      <View style={{ height: spacing.lg }} />
      <Link
        href="/(auth)/forgot-password"
        style={[styles.link, { color: theme.accent }]}
      >
        ¿Olvidaste tu contraseña?
      </Link>

      <View style={{ height: spacing.xxxl }} />
      <View style={styles.row}>
        <Text style={{ color: theme.textSecondary }}>¿No tienes cuenta? </Text>
        <Link
          href="/(auth)/register"
          style={[styles.link, { color: theme.accent }]}
        >
          Regístrate
        </Link>
      </View>

      <View style={{ height: spacing.xl }} />
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        ¿Eres oyente? Descarga la app VooXiE.
      </Text>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  formError: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  link: { ...typography.bodyStrong, textAlign: "center" },
  hint: { ...typography.caption, textAlign: "center" },
  row: { flexDirection: "row", justifyContent: "center" },
});

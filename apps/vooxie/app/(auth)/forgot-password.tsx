import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Link } from "expo-router";
import Constants from "expo-constants";
import {
  useTheme,
  Button,
  TextField,
  AuthWordmark,
  FormScreen,
  spacing,
  typography,
} from "@vooxie/ui";
import { sendPasswordReset } from "@vooxie/core";

export default function ForgotPasswordScreen() {
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit() {
    setFormError(null);
    setLoading(true);

    // El scheme viene de app.config.ts (extra no lo expone directamente,
    // pero el scheme sí es público vía Constants.expoConfig.scheme).
    const scheme = Constants.expoConfig?.scheme;
    const redirectTo = `${Array.isArray(scheme) ? scheme[0] : scheme}://reset-password`;

    const result = await sendPasswordReset(email, redirectTo);
    setLoading(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <FormScreen contentStyle={styles.center}>
        <AuthWordmark size="sm" />
        <View style={{ height: spacing.xxl }} />
        <Text style={[styles.title, { color: theme.text }]}>
          Revisa tu correo
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Si {email} tiene una cuenta, te enviamos un enlace para restablecer tu
          contraseña.
        </Text>
        <View style={{ height: spacing.xl }} />
        <Link
          href="/(auth)/login"
          style={[styles.link, { color: theme.accent }]}
        >
          Volver a iniciar sesión
        </Link>
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <AuthWordmark size="sm" />
      <View style={{ height: spacing.xxl }} />
      <Text style={[styles.title, { color: theme.text }]}>
        ¿Olvidaste tu contraseña?
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Ingresa tu correo y te enviaremos un enlace para restablecerla.
      </Text>

      <View style={{ height: spacing.xl }} />

      <TextField
        label="Correo electrónico"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />

      {formError ? (
        <Text style={[styles.formError, { color: theme.danger }]}>
          {formError}
        </Text>
      ) : null}

      <View style={{ height: spacing.xl }} />
      <Button label="Enviar enlace" onPress={onSubmit} loading={loading} />

      <View style={{ height: spacing.xl }} />
      <Link href="/(auth)/login" style={[styles.link, { color: theme.accent }]}>
        Volver a iniciar sesión
      </Link>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center" },
  title: { ...typography.displayMd, textAlign: "center" },
  subtitle: { ...typography.body, textAlign: "center", marginTop: spacing.xs },
  formError: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  link: { ...typography.bodyStrong, textAlign: "center" },
});

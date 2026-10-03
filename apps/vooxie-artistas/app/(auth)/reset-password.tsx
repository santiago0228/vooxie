import { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  useTheme,
  Button,
  TextField,
  AuthWordmark,
  FormScreen,
  spacing,
  typography,
} from "@vooxie/ui";
import { updatePassword, signOut } from "@vooxie/core";

export default function ResetPasswordScreen() {
  const { theme } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ error?: string }>();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    params.error || null,
  );
  const [done, setDone] = useState(false);

  async function onSubmit() {
    setFormError(null);
    if (password.length < 8) {
      setFormError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(true);
    const result = await updatePassword(password);
    setLoading(false);
    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    await signOut();
    setDone(true);
  }

  if (done) {
    return (
      <FormScreen contentStyle={styles.center}>
        <AuthWordmark label="Artistas" size="sm" />
        <View style={{ height: spacing.xxl }} />
        <Text style={[styles.title, { color: theme.text }]}>
          Contraseña actualizada
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Ya puedes iniciar sesión con tu nueva contraseña.
        </Text>
        <View style={{ height: spacing.xl }} />
        <Button
          label="Ir a iniciar sesión"
          onPress={() => router.replace("/(auth)/login")}
        />
      </FormScreen>
    );
  }

  return (
    <FormScreen>
      <AuthWordmark label="Artistas" size="sm" />
      <View style={{ height: spacing.xxl }} />
      <Text style={[styles.title, { color: theme.text }]}>
        Nueva contraseña
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Elige una contraseña nueva para tu cuenta.
      </Text>

      <View style={{ height: spacing.xl }} />

      <TextField
        label="Nueva contraseña"
        value={password}
        onChangeText={setPassword}
        isPassword
      />
      <View style={{ height: spacing.md }} />
      <TextField
        label="Confirmar nueva contraseña"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        isPassword
      />

      {formError ? (
        <Text style={[styles.formError, { color: theme.danger }]}>
          {formError}
        </Text>
      ) : null}

      <View style={{ height: spacing.xl }} />
      <Button label="Guardar contraseña" onPress={onSubmit} loading={loading} />
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
});

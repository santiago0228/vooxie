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
import {
  signUp,
  validateRegisterInput,
  checkUsernameAvailable,
} from "@vooxie/core";

export default function RegisterScreen() {
  const { theme } = useTheme();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [done, setDone] = useState(false);

  async function onUsernameBlur() {
    const u = username.trim();
    if (!u || /\s/.test(u) || u.length < 3) return;
    setCheckingUsername(true);
    const result = await checkUsernameAvailable(u);
    setCheckingUsername(false);
    setUsernameError(
      result.ok && !result.data
        ? "Ese nombre de usuario ya está en uso."
        : null,
    );
  }

  async function onSubmit() {
    setFormError(null);
    const validationError = validateRegisterInput({
      username,
      email,
      password,
      confirmPassword,
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    if (usernameError) {
      setFormError(usernameError);
      return;
    }

    setLoading(true);
    const result = await signUp({ username, email, password });
    setLoading(false);

    if (!result.ok) {
      setFormError(result.message);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <FormScreen contentStyle={styles.center}>
        <AuthWordmark label="Artistas" size="sm" />
        <View style={{ height: spacing.xxl }} />
        <Text style={[styles.title, { color: theme.text }]}>
          Revisa tu correo
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Te enviamos un enlace de confirmación a {email}. Después de
          confirmarlo e iniciar sesión, vas a poder crear tu perfil de artista.
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
      <AuthWordmark label="Artistas" size="sm" />
      <View style={{ height: spacing.xxl }} />
      <Text style={[styles.title, { color: theme.text }]}>
        Crear cuenta de artista
      </Text>
      <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
        Primero creamos tu cuenta; el perfil de artista (nombre público,
        biografía) se configura en el siguiente paso.
      </Text>

      <View style={{ height: spacing.xl }} />

      <TextField
        label="Nombre de usuario"
        value={username}
        onChangeText={(v) => {
          setUsername(v);
          setUsernameError(null);
        }}
        onBlur={onUsernameBlur}
        autoCapitalize="none"
        autoCorrect={false}
        error={usernameError}
      />
      {checkingUsername ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Comprobando disponibilidad...
        </Text>
      ) : null}
      <View style={{ height: spacing.md }} />
      <TextField
        label="Correo electrónico"
        value={email}
        onChangeText={setEmail}
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
      <View style={{ height: spacing.md }} />
      <TextField
        label="Confirmar contraseña"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        isPassword
      />

      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Mínimo 8 caracteres · el usuario no puede tener espacios
      </Text>

      {formError ? (
        <Text style={[styles.formError, { color: theme.danger }]}>
          {formError}
        </Text>
      ) : null}

      <View style={{ height: spacing.xl }} />
      <Button label="Continuar" onPress={onSubmit} loading={loading} />

      <View style={{ height: spacing.xxl }} />
      <View style={styles.row}>
        <Text style={{ color: theme.textSecondary }}>¿Ya tienes cuenta? </Text>
        <Link
          href="/(auth)/login"
          style={[styles.link, { color: theme.accent }]}
        >
          Iniciar sesión
        </Link>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center" },
  title: { ...typography.displayMd, textAlign: "center" },
  subtitle: { ...typography.body, textAlign: "center", marginTop: spacing.xs },
  hint: { ...typography.micro, marginTop: spacing.sm },
  formError: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  link: { ...typography.bodyStrong, textAlign: "center" },
  row: { flexDirection: "row", justifyContent: "center" },
});

import { supabase } from "../supabase/client";
import { mapAuthError } from "./errors";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AuthResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; message: string };

function isEmail(value: string) {
  return EMAIL_REGEX.test(value.trim());
}

/**
 * Validaciones de registro (sección 2). Se ejecutan en el cliente antes de
 * llamar a Supabase — validación básica de formato, no de negocio (eso lo
 * sigue garantizando la base de datos: username UNIQUE, etc).
 */
export function validateRegisterInput(input: {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}): string | null {
  const username = input.username.trim();

  if (!username) return "El nombre de usuario es obligatorio.";
  if (/\s/.test(username)) return "El nombre de usuario no puede contener espacios.";
  if (username.length < 3) return "El nombre de usuario debe tener al menos 3 caracteres.";
  if (!isEmail(input.email)) return "Ingresa un correo electrónico válido.";
  if (input.password.length < 8) return "La contraseña debe tener al menos 8 caracteres.";
  if (input.password !== input.confirmPassword) return "Las contraseñas no coinciden.";

  return null;
}

/**
 * Chequeo de disponibilidad de username vía RPC (respeta perfiles privados,
 * ver migración 0002). Se usa para dar feedback temprano en el formulario;
 * la garantía real sigue siendo el UNIQUE constraint en la base de datos.
 */
export async function checkUsernameAvailable(
  username: string
): Promise<AuthResult<boolean>> {
  const { data, error } = await supabase.rpc("is_username_available", {
    check_username: username.trim(),
  });

  if (error) return { ok: false, message: mapAuthError(error) };
  return { ok: true, data: data ?? false };
}

/**
 * Registro. El profile se crea automáticamente vía trigger
 * (handle_new_user, migración 0002) a partir de options.data.username —
 * no se hace un insert manual aparte, así se evita la ventana donde existe
 * un auth.users sin profiles correspondiente.
 */
export async function signUp(input: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthResult> {
  const { error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: { username: input.username.trim() },
    },
  });

  if (error) return { ok: false, message: mapAuthError(error) };
  return { ok: true, data: undefined };
}

/**
 * Login con email O username. Si `identifier` no parece un email, se
 * resuelve a email vía RPC (migración 0002) antes de llamar
 * signInWithPassword — Supabase Auth no soporta login directo por username.
 */
export async function signIn(input: {
  identifier: string;
  password: string;
}): Promise<AuthResult> {
  const identifier = input.identifier.trim();
  let email = identifier;

  if (!isEmail(identifier)) {
    const { data, error } = await supabase.rpc("resolve_login_identifier", {
      identifier,
    });

    if (error) return { ok: false, message: mapAuthError(error) };
    if (!data) {
      // Mismo mensaje que credenciales inválidas — no revelar si el
      // username existe o no.
      return { ok: false, message: "Correo/usuario o contraseña incorrectos." };
    }
    email = data;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (error) return { ok: false, message: mapAuthError(error) };
  return { ok: true, data: undefined };
}

export async function signOut(): Promise<AuthResult> {
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, message: mapAuthError(error) };
  return { ok: true, data: undefined };
}

/**
 * redirectTo debe coincidir con additional_redirect_urls en
 * supabase/config.toml (y con su equivalente configurado en el proyecto
 * de Supabase en la nube cuando exista).
 */
export async function sendPasswordReset(
  email: string,
  redirectTo: string
): Promise<AuthResult> {
  if (!isEmail(email)) {
    return { ok: false, message: "Ingresa un correo electrónico válido." };
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });
  if (error) return { ok: false, message: mapAuthError(error) };
  return { ok: true, data: undefined };
}

/**
 * Se llama DESPUÉS de que el deep link de recuperación ya estableció una
 * sesión temporal (ver auth/deepLinks.ts). Requiere sesión activa.
 */
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  if (newPassword.length < 8) {
    return { ok: false, message: "La contraseña debe tener al menos 8 caracteres." };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, message: mapAuthError(error) };
  return { ok: true, data: undefined };
}

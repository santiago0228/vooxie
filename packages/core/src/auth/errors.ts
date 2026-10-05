import { AuthError } from "@supabase/supabase-js";

/**
 * Traduce errores conocidos de Supabase Auth a mensajes en español que sí
 * se le pueden mostrar al usuario. Sección 11: "no mostrar errores técnicos
 * de Supabase directamente".
 *
 * Deliberadamente genérico para credenciales inválidas (no distingue
 * "usuario no existe" de "contraseña incorrecta" ni de "username no
 * encontrado") — evita enumeración de cuentas.
 */
export function mapAuthError(error: unknown): string {
  if (error instanceof AuthError) {
    const msg = error.message.toLowerCase();

    if (msg.includes("invalid login credentials")) {
      return "Correo/usuario o contraseña incorrectos.";
    }
    if (msg.includes("email not confirmed")) {
      return "Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.";
    }
    if (msg.includes("user already registered")) {
      return "Ya existe una cuenta con ese correo.";
    }
    if (msg.includes("password should be at least")) {
      return "La contraseña debe tener al menos 8 caracteres.";
    }
    if (msg.includes("rate limit")) {
      return "Demasiados intentos. Espera un momento y vuelve a intentarlo.";
    }
    if (msg.includes("network")) {
      return "No hay conexión. Revisa tu internet e inténtalo de nuevo.";
    }
    return "No pudimos completar la operación. Inténtalo de nuevo.";
  }

  // Violación de unique constraint en profiles.username, propagada desde
  // el trigger handle_new_user() cuando el username ya existe.
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string"
  ) {
    const msg = (error as { message: string }).message.toLowerCase();
    if (msg.includes("duplicate key") && msg.includes("username")) {
      return "Ese nombre de usuario ya está en uso.";
    }
  }

  return "Ocurrió un error inesperado. Inténtalo de nuevo.";
}

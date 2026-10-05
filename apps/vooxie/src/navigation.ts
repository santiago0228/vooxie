/**
 * Volver atrás sin romper si no hay historial (p. ej. al abrir /player tras recargar la app).
 * `router.back()` sin pantalla previa lanza "GO_BACK was not handled by any navigator".
 */
type BackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  replace: (href: "/") => void;
};

export function goBackSafe(router: BackRouter): void {
  if (router.canGoBack()) router.back();
  else router.replace("/");
}

import { create } from "zustand";

/**
 * Store de preferencias del usuario. En Fase 0 solo trae el theme mode;
 * en fases posteriores se agregan: calidad de audio, Canvas (on/off, solo Wi-Fi),
 * datos móviles, letras, notificaciones, accesibilidad — ver arquitectura, sección 8 (Ajustes).
 */

type ThemeMode = "dark" | "light" | "system";

type SettingsState = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
};

export const useSettingsStore = create<SettingsState>((set) => ({
  themeMode: "system",
  setThemeMode: (mode) => set({ themeMode: mode }),
}));

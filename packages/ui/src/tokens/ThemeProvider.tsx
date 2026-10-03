import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { darkTheme, lightTheme, Theme } from "./colors";

type ThemeMode = "dark" | "light" | "system";

type ThemeContextValue = {
  theme: Theme;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  mode: initialMode = "system",
}: {
  children: React.ReactNode;
  /** Modo inicial. Por defecto sigue al sistema. */
  mode?: ThemeMode;
}) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>(initialMode);

  const isDark = mode === "system" ? systemScheme !== "light" : mode === "dark";
  const theme = isDark ? darkTheme : lightTheme;

  const value = useMemo(
    () => ({ theme, mode, isDark, setMode }),
    [theme, mode, isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
}

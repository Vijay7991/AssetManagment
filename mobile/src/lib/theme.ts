import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const palette = {
  light: {
    background: "#FFFFFF",
    surface: "#F4F4F6",
    text: "#0A0A0A",
    textMuted: "#6B7280",
    border: "#E5E7EB",
    primary: "#1F2A44",
    primaryText: "#FFFFFF",
    accent: "#2E75B6",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#DC2626",
  },
  dark: {
    background: "#0A0A0A",
    surface: "#171717",
    text: "#F5F5F5",
    textMuted: "#9CA3AF",
    border: "#262626",
    primary: "#F5F5F5",
    primaryText: "#0A0A0A",
    accent: "#3B82F6",
    success: "#10B981",
    warning: "#F59E0B",
    danger: "#EF4444",
  },
};

export type Theme = typeof palette.light;
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "assethub.theme.mode";

type Ctx = {
  theme: Theme;
  mode: ThemeMode;            // user's explicit choice
  resolved: "light" | "dark"; // what we actually render
  setMode: (m: ThemeMode) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

/// Wraps the app and provides a manual light/dark/system toggle that
/// persists across launches in AsyncStorage.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "light" || v === "dark" || v === "system") setModeState(v);
    });
  }, []);

  function setMode(m: ThemeMode) {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m).catch(() => {});
  }

  const value = useMemo<Ctx>(() => {
    const resolved: "light" | "dark" =
      mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
    return { theme: palette[resolved], mode, resolved, setMode };
  }, [mode, system]);

  return React.createElement(ThemeCtx.Provider, { value }, children);
}

/// Returns the active palette. Backwards-compatible with existing call sites.
export function useTheme(): Theme {
  const ctx = useContext(ThemeCtx);
  return ctx ? ctx.theme : palette.light;
}

/// Full theme context for components that need to read or change the mode.
export function useThemeMode(): Ctx {
  const ctx = useContext(ThemeCtx);
  if (!ctx) {
    return { theme: palette.light, mode: "system", resolved: "light", setMode: () => {} };
  }
  return ctx;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

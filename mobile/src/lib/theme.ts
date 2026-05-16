import { useColorScheme } from "react-native";

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

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "dark" ? palette.dark : palette.light;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

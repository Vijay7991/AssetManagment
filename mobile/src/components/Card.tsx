import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { useTheme } from "@/lib/theme";

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: t.surface,
          borderColor: t.border,
          borderWidth: 1,
          borderRadius: 12,
          padding: 16,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

type BadgeVariant = "default" | "success" | "warning" | "danger" | "outline";

export function Badge({ label, variant = "default" }: { label: string; variant?: BadgeVariant }) {
  const t = useTheme();
  const colors: Record<BadgeVariant, { bg: string; fg: string }> = {
    default: { bg: t.surface, fg: t.text },
    success: { bg: "rgba(16,185,129,0.15)", fg: t.success },
    warning: { bg: "rgba(245,158,11,0.15)", fg: t.warning },
    danger: { bg: "rgba(220,38,38,0.15)", fg: t.danger },
    outline: { bg: "transparent", fg: t.text },
  };
  const c = colors[variant];
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: c.bg,
          borderColor: variant === "outline" ? t.border : "transparent",
          borderWidth: variant === "outline" ? 1 : 0,
        },
      ]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
});

export function statusVariant(status: string): BadgeVariant {
  if (status === "InService") return "success";
  if (status === "InRepair") return "warning";
  if (status === "Retired" || status === "Lost") return "danger";
  return "default";
}

export function prettyStatus(s: string) {
  return s.replace(/([A-Z])/g, " $1").trim();
}

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme, spacing } from "@/lib/theme";

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      {icon}
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {description && <Text style={[styles.desc, { color: t.textMuted }]}>{description}</Text>}
      {action && <View style={{ marginTop: spacing.lg }}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: spacing.md,
  },
  desc: {
    fontSize: 13,
    textAlign: "center",
    maxWidth: 280,
  },
});

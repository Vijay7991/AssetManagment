import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/lib/theme";

type Variant = "primary" | "secondary" | "outline" | "danger" | "ghost";
type Size = "sm" | "md" | "lg";

export function Button({
  title,
  onPress,
  variant = "primary",
  size = "md",
  loading,
  disabled,
  icon,
  fullWidth,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}) {
  const t = useTheme();

  const bg = {
    primary: t.primary,
    secondary: t.surface,
    outline: "transparent",
    danger: t.danger,
    ghost: "transparent",
  }[variant];

  const fg = {
    primary: t.primaryText,
    secondary: t.text,
    outline: t.text,
    danger: "#FFFFFF",
    ghost: t.text,
  }[variant];

  const borderColor =
    variant === "outline" ? t.border : variant === "secondary" ? t.border : "transparent";

  const padV = size === "sm" ? 8 : size === "lg" ? 16 : 12;
  const padH = size === "sm" ? 12 : size === "lg" ? 24 : 16;
  const fontSize = size === "sm" ? 13 : size === "lg" ? 17 : 15;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor,
          borderWidth: 1,
          paddingVertical: padV,
          paddingHorizontal: padH,
          opacity: pressed ? 0.85 : disabled ? 0.5 : 1,
          alignSelf: fullWidth ? "stretch" : "auto",
        },
      ]}>
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <>
            {icon}
            <Text style={[styles.label, { color: fg, fontSize, marginLeft: icon ? 8 : 0 }]}>
              {title}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  label: {
    fontWeight: "600",
  },
});

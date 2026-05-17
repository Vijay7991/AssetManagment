import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing } from "@/lib/theme";

/// Password input with a show/hide eye icon on the right. Mirrors the web's
/// PasswordInput so the two clients feel the same. Use everywhere you'd
/// previously use `<TextInput secureTextEntry … />`.
export function PasswordField({
  label,
  value,
  onChangeText,
  autoComplete = "password",
  placeholder,
  ...rest
}: {
  label?: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
} & Omit<TextInputProps, "value" | "onChangeText" | "secureTextEntry">) {
  const t = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={label ? { gap: spacing.sm } : undefined}>
      {label && <Text style={{ color: t.text, fontSize: 13, fontWeight: "500" }}>{label}</Text>}
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          // RN doesn't have a "show password" toggle built in — flipping
          // secureTextEntry on the fly is the standard approach.
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={autoComplete as any}
          textContentType="password"
          placeholder={placeholder}
          placeholderTextColor={t.textMuted}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          {...rest}
        />
        <Pressable
          onPress={() => setVisible(v => !v)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={visible ? "Hide password" : "Show password"}
          style={styles.eye}>
          <Ionicons
            name={visible ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={t.textMuted}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: "relative", justifyContent: "center" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingRight: 44, // reserve room for the eye so the value doesn't slide under
    fontSize: 16,
  },
  eye: {
    position: "absolute",
    right: 12,
    height: 28,
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
});

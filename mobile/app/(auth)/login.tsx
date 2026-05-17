import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/PasswordField";
import { useAuth } from "@/lib/auth";
import { useTheme, spacing } from "@/lib/theme";
import { clearServerUrl } from "@/lib/server";

export default function LoginScreen() {
  const t = useTheme();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit() {
    if (!email || !password) {
      setErr("Email and password required.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      await login(email, password);
      router.replace("/(tabs)/scan");
    } catch (e: any) {
      setErr(e?.message || "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function changeServer() {
    await clearServerUrl();
    router.replace("/setup");
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.flex, { backgroundColor: t.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: t.text }]}>AssetHub</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>Sign in</Text>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: t.text }]}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={t.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
            />
          </View>

          <PasswordField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
          />

          {err && <Text style={[styles.error, { color: t.danger }]}>{err}</Text>}

          <Button title={busy ? "Signing in…" : "Sign in"} onPress={onSubmit} loading={busy} fullWidth />

          <Link href="/(auth)/forgot-password" asChild>
            <Text style={[styles.linkRow, { color: t.accent, fontSize: 13 }]}>
              Forgot password?
            </Text>
          </Link>

          <Link href="/(auth)/signup" asChild>
            <Text style={[styles.linkRow, { color: t.text }]}>
              No account? <Text style={{ fontWeight: "600" }}>Create one</Text>
            </Text>
          </Link>

          <Text
            onPress={changeServer}
            style={[styles.changeServer, { color: t.textMuted }]}>
            Change server
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  title: { fontSize: 32, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", marginTop: spacing.xs },
  form: { marginTop: spacing.xxl, gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { fontSize: 13, fontWeight: "500" },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  error: { fontSize: 13, textAlign: "center" },
  linkRow: { textAlign: "center", fontSize: 14, marginTop: spacing.sm },
  changeServer: { textAlign: "center", fontSize: 12, marginTop: spacing.xl, textDecorationLine: "underline" },
});

import { useState } from "react";
import { Link, useRouter } from "expo-router";
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import { Button } from "@/components/Button";
import { api } from "@/lib/api";
import { useTheme, spacing } from "@/lib/theme";

/// "Forgot password" — kicks off the email reset flow. The API always
/// returns 200 so this screen can't be used to enumerate accounts; we mirror
/// that by showing the same "Check your inbox" message regardless of result.
export default function ForgotPasswordScreen() {
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit() {
    if (!email.trim()) {
      setErr("Email is required.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      await api.post("/api/auth/forgot-password", { email: email.trim() });
      setSent(true);
    } catch (e: any) {
      setErr(e?.message || "Could not send reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.flex, { backgroundColor: t.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: t.text }]}>Reset password</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          We'll email you a single-use link.
        </Text>

        {sent ? (
          <View style={[styles.successBox, { backgroundColor: "rgba(16,185,129,0.1)", borderColor: t.success }]}>
            <Text style={{ color: t.success, fontWeight: "600", fontSize: 14 }}>
              Check your inbox
            </Text>
            <Text style={{ color: t.textMuted, fontSize: 13, marginTop: 6 }}>
              If an account exists for {email.trim()}, we sent a password-reset link to
              it. The link is valid for 1 hour. After resetting, sign back in here.
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <Button title="Back to sign in" onPress={() => router.replace("/(auth)/login")} fullWidth />
            </View>
          </View>
        ) : (
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

            {err && <Text style={[styles.error, { color: t.danger }]}>{err}</Text>}

            <Button
              title={busy ? "Sending…" : "Send reset link"}
              onPress={onSubmit}
              loading={busy}
              fullWidth
            />

            <Link href="/(auth)/login" asChild>
              <Text style={[styles.linkRow, { color: t.text }]}>
                Remembered it? <Text style={{ fontWeight: "600" }}>Sign in</Text>
              </Text>
            </Link>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 13, textAlign: "center", marginTop: spacing.xs },
  form: { marginTop: spacing.xl, gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { fontSize: 13, fontWeight: "500" },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  error: { fontSize: 13, textAlign: "center" },
  linkRow: { textAlign: "center", fontSize: 14, marginTop: spacing.sm },
  successBox: {
    marginTop: spacing.xl,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.lg,
  },
});

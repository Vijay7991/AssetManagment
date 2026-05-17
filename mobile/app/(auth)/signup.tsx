import { useState } from "react";
import { Link, useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/PasswordField";
import { useAuth } from "@/lib/auth";
import { useTheme, spacing } from "@/lib/theme";

export default function SignupScreen() {
  const t = useTheme();
  const router = useRouter();
  const { signup } = useAuth();
  const [form, setForm] = useState({ displayName: "", email: "", password: "", workspaceName: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit() {
    if (!form.displayName || !form.email || form.password.length < 8) {
      setErr("Name, email, and 8+ char password required.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      await signup({
        displayName: form.displayName,
        email: form.email,
        password: form.password,
        workspaceName: form.workspaceName || undefined,
      });
      router.replace("/(tabs)/scan");
    } catch (e: any) {
      setErr(e?.message || "Signup failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.flex, { backgroundColor: t.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: t.text }]}>Create your workspace</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>Free for individuals</Text>

        <View style={styles.form}>
          <Field label="Your name" value={form.displayName}
                 onChangeText={v => setForm(f => ({ ...f, displayName: v }))} />
          <Field label="Workspace name (optional)" value={form.workspaceName}
                 onChangeText={v => setForm(f => ({ ...f, workspaceName: v }))}
                 placeholder="e.g. Acme Construction" />
          <Field label="Email" value={form.email} email
                 onChangeText={v => setForm(f => ({ ...f, email: v }))} />
          <PasswordField
            label="Password (min 8)"
            value={form.password}
            onChangeText={v => setForm(f => ({ ...f, password: v }))}
            autoComplete="new-password"
          />

          {err && <Text style={[styles.error, { color: t.danger }]}>{err}</Text>}

          <Button title={busy ? "Creating…" : "Create account"} onPress={onSubmit} loading={busy} fullWidth />

          <Link href="/(auth)/login" asChild>
            <Text style={[styles.linkRow, { color: t.text }]}>
              Already have an account? <Text style={{ fontWeight: "600" }}>Sign in</Text>
            </Text>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/// Plain text field. Passwords use the shared <PasswordField> component
/// instead so the eye-toggle behavior stays consistent across login + signup.
function Field({
  label, value, onChangeText, placeholder, email,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  email?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: t.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textMuted}
        autoCapitalize={email ? "none" : "sentences"}
        autoCorrect={!email}
        keyboardType={email ? "email-address" : "default"}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: spacing.xl, justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  subtitle: { fontSize: 14, textAlign: "center", marginTop: spacing.xs },
  form: { marginTop: spacing.xl, gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { fontSize: 13, fontWeight: "500" },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  error: { fontSize: 13, textAlign: "center" },
  linkRow: { textAlign: "center", fontSize: 14, marginTop: spacing.sm },
});

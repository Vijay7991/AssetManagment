import { useState } from "react";
import { useRouter } from "expo-router";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "@/components/Button";
import { useTheme, spacing } from "@/lib/theme";
import { probeServer, setServerUrl } from "@/lib/server";

export default function SetupScreen() {
  const t = useTheme();
  const router = useRouter();
  const [url, setUrl] = useState("https://");
  const [status, setStatus] = useState<"idle" | "checking" | "ok" | "fail">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function onContinue() {
    setStatus("checking");
    setMessage(null);
    const result = await probeServer(url);
    if (result.ok) {
      setStatus("ok");
      await setServerUrl(url);
      router.replace("/(auth)/login");
    } else {
      setStatus("fail");
      setMessage(result.message || "Could not reach the server.");
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.flex, { backgroundColor: t.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.title, { color: t.text }]}>AssetHub</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>Connect to your server</Text>

        <View style={[styles.field, { marginTop: spacing.xxl }]}>
          <Text style={[styles.label, { color: t.text }]}>Server URL</Text>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://192.168.1.42"
            placeholderTextColor={t.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            inputMode="url"
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          />
          <Text style={[styles.hint, { color: t.textMuted }]}>
            On the same Wi-Fi as your AssetHub server. Use https:// if your server uses TLS,
            or http:// for plain LAN.
            {"\n"}
            Emulator users: try https://10.0.2.2 to reach your laptop's localhost.
          </Text>
        </View>

        {status === "fail" && message && (
          <View style={[styles.errorBox, { backgroundColor: "rgba(220,38,38,0.1)", borderColor: t.danger }]}>
            <Text style={{ color: t.danger, fontSize: 13 }}>{message}</Text>
            <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 6 }}>
              If the URL works in your phone's browser but fails here, the certificate may be
              untrusted. See README → "HTTPS / self-signed certificate" for the fix.
            </Text>
          </View>
        )}

        <View style={{ marginTop: spacing.xl }}>
          <Button
            title={status === "checking" ? "Checking…" : "Continue"}
            onPress={onContinue}
            loading={status === "checking"}
            fullWidth
          />
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
  field: { gap: spacing.sm },
  label: { fontSize: 13, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  hint: { fontSize: 12, lineHeight: 18 },
  errorBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 10,
    borderWidth: 1,
  },
});

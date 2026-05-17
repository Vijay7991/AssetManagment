import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuth from "expo-local-authentication";
import { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { useTheme, spacing } from "@/lib/theme";
import { Ionicons } from "@expo/vector-icons";

const LOCK_KEY = "biometric_lock";
const LOCK_AFTER_MS = 5 * 60 * 1000; // 5 minutes in background

/// Wraps the app and prompts for biometric when enabled.
/// Shows a lock screen after 5 minutes in background.
export function BiometricGate({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const backgroundedAt = useRef<number | null>(null);

  async function checkLock() {
    const enabled = await AsyncStorage.getItem(LOCK_KEY);
    if (enabled !== "1") { setChecking(false); return; }
    const hw = await LocalAuth.hasHardwareAsync();
    const enrolled = await LocalAuth.isEnrolledAsync();
    if (!hw || !enrolled) { setChecking(false); return; }
    setLocked(true);
    setChecking(false);
    authenticate();
  }

  async function authenticate() {
    setError(null);
    try {
      const res = await LocalAuth.authenticateAsync({
        promptMessage: "Unlock AssetHub",
        fallbackLabel: "Use password",
        cancelLabel: "Cancel",
      });
      if (res.success) {
        setLocked(false);
      } else {
        setError("Authentication cancelled. Tap to try again.");
      }
    } catch {
      setError("Biometric authentication failed.");
    }
  }

  useEffect(() => {
    checkLock();
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "background") {
        backgroundedAt.current = Date.now();
      } else if (state === "active" && backgroundedAt.current) {
        const elapsed = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (elapsed > LOCK_AFTER_MS) {
          const enabled = await AsyncStorage.getItem(LOCK_KEY);
          if (enabled === "1") {
            const hw = await LocalAuth.hasHardwareAsync();
            const enrolled = await LocalAuth.isEnrolledAsync();
            if (hw && enrolled) {
              setLocked(true);
              authenticate();
            }
          }
        }
      }
    });
    return () => sub.remove();
  }, []);

  if (checking) return null;

  if (locked) {
    return (
      <View style={[styles.lock, { backgroundColor: t.background }]}>
        <Ionicons name="lock-closed" size={48} color={t.textMuted} />
        <Text style={[styles.lockTitle, { color: t.text }]}>AssetHub is locked</Text>
        {error && <Text style={[styles.lockErr, { color: t.danger }]}>{error}</Text>}
        <View style={{ marginTop: spacing.xl, width: "60%" }}>
          <Button title="Unlock" onPress={authenticate} fullWidth />
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

export const BIOMETRIC_LOCK_KEY = LOCK_KEY;

const styles = StyleSheet.create({
  lock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.md,
  },
  lockTitle: { fontSize: 20, fontWeight: "700" },
  lockErr: { fontSize: 13, textAlign: "center" },
});

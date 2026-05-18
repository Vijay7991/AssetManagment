import { useRouter } from "expo-router";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as LocalAuth from "expo-local-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { BIOMETRIC_LOCK_KEY } from "@/components/BiometricGate";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { clearServerUrl, getServerUrl } from "@/lib/server";
import { useTheme, useThemeMode, spacing, ThemeMode } from "@/lib/theme";
import { useEffect, useState } from "react";

const APP_VERSION = "1.1.0";

export default function ProfileScreen() {
  const t = useTheme();
  const { mode, setMode } = useThemeMode();
  const router = useRouter();
  const { user, activeTenant, tenants, switchTenant, logout } = useAuth();
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ apkUrl: string; version: string; notes: string } | null>(null);

  useEffect(() => {
    getServerUrl().then(setServerUrl);
    // Check for a newer APK on the server
    api.get<{ version: string; apkUrl: string; notes: string }>("/app/version", null)
      .then(info => {
        if (isNewerVersion(info.version, APP_VERSION)) setUpdateInfo(info);
      })
      .catch(() => {/* non-critical */});
    (async () => {
      const hw = await LocalAuth.hasHardwareAsync();
      const enrolled = await LocalAuth.isEnrolledAsync();
      setBiometricAvailable(hw && enrolled);
      const stored = await AsyncStorage.getItem(BIOMETRIC_LOCK_KEY);
      setBiometricEnabled(stored === "1");
    })();
  }, []);

  async function toggleBiometric(value: boolean) {
    if (value) {
      const res = await LocalAuth.authenticateAsync({ promptMessage: "Confirm to enable biometric lock" });
      if (!res.success) return;
    }
    await AsyncStorage.setItem(BIOMETRIC_LOCK_KEY, value ? "1" : "0");
    setBiometricEnabled(value);
  }

  async function onLogout() {
    Alert.alert("Sign out?", "You'll need to sign in again on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out", style: "destructive", onPress: async () => {
          await logout();
          router.replace("/(auth)/login");
        }
      },
    ]);
  }

  async function onChangeServer() {
    Alert.alert(
      "Change server?",
      "This will sign you out and let you connect to a different AssetHub instance.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue", onPress: async () => {
            await logout();
            await clearServerUrl();
            router.replace("/setup");
          }
        },
      ]
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Text style={[styles.title, { color: t.text }]}>Profile</Text>

        {updateInfo && (
          <Pressable
            onPress={() => Linking.openURL(updateInfo.apkUrl)}
            style={[styles.updateBanner, { backgroundColor: t.accent + "22", borderColor: t.accent }]}>
            <Ionicons name="arrow-down-circle-outline" size={20} color={t.accent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.accent, fontWeight: "700", fontSize: 13 }}>
                Update available — v{updateInfo.version}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>
                {updateInfo.notes || "Tap to download the new APK"}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={t.accent} />
          </Pressable>
        )}

        <Card>
          <View style={styles.row}>
            <View style={[styles.avatar, { backgroundColor: t.primary }]}>
              <Text style={{ color: t.primaryText, fontWeight: "700", fontSize: 18 }}>
                {(user?.displayName || user?.email || "?").slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: t.text }]}>{user?.displayName}</Text>
              <Text style={[styles.muted, { color: t.textMuted }]}>{user?.email}</Text>
            </View>
          </View>
        </Card>

        <Card>
          <Text style={[styles.section, { color: t.text }]}>Workspace</Text>
          <KV label="Name" value={activeTenant?.name || "—"} />
          <KV label="Plan" value={activeTenant?.plan || "—"} />
          <KV label="Your role" value={activeTenant?.role || "—"} />
          {activeTenant?.isOwner && (
            <View style={[styles.ownerRow, { backgroundColor: "rgba(245,158,11,0.15)" }]}>
              <Ionicons name="ribbon" size={14} color={t.warning} />
              <Text style={{ color: t.warning, fontSize: 12, fontWeight: "600", marginLeft: 6 }}>
                Workspace owner
              </Text>
            </View>
          )}
        </Card>

        {tenants.length > 1 && (
          <Card>
            <Text style={[styles.section, { color: t.text }]}>Switch workspace</Text>
            {tenants.filter(x => x.id !== activeTenant?.id).map(tn => (
              <Button
                key={tn.id}
                title={`${tn.name}  ·  ${tn.role}`}
                variant="outline"
                onPress={() => switchTenant(tn.id)}
                fullWidth
              />
            ))}
          </Card>
        )}

        <Card>
          <Text style={[styles.section, { color: t.text }]}>Appearance</Text>
          <View style={[styles.segment, { borderColor: t.border, backgroundColor: t.surface }]}>
            {(["light", "dark", "system"] as ThemeMode[]).map((m) => {
              const active = mode === m;
              const icon = m === "light" ? "sunny-outline" : m === "dark" ? "moon-outline" : "phone-portrait-outline";
              const label = m === "light" ? "Light" : m === "dark" ? "Dark" : "System";
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  style={[
                    styles.segmentBtn,
                    active && { backgroundColor: t.background, borderColor: t.accent },
                  ]}>
                  <Ionicons name={icon as any} size={16} color={active ? t.accent : t.textMuted} />
                  <Text style={{
                    color: active ? t.text : t.textMuted,
                    fontWeight: active ? "600" : "500",
                    fontSize: 13,
                  }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {biometricAvailable && (
          <Card>
            <Text style={[styles.section, { color: t.text }]}>Security</Text>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, paddingRight: spacing.md }}>
                <Text style={{ color: t.text, fontSize: 14, fontWeight: "500" }}>
                  Biometric lock
                </Text>
                <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>
                  Require Face/Touch ID when opening the app.
                </Text>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={toggleBiometric}
                trackColor={{ false: t.border, true: t.accent }}
              />
            </View>
          </Card>
        )}

        <Card>
          <Text style={[styles.section, { color: t.text }]}>Server</Text>
          <Text style={[styles.serverUrl, { color: t.textMuted }]} numberOfLines={1}>
            {serverUrl || "—"}
          </Text>
          <KV label="App version" value={`v${APP_VERSION}`} />
          <View style={{ marginTop: spacing.sm }}>
            <Button title="Change server" variant="outline" size="sm" onPress={onChangeServer} />
          </View>
        </Card>

        <View style={{ marginTop: spacing.md }}>
          <Button
            title="Sign out"
            variant="danger"
            onPress={onLogout}
            fullWidth
            icon={<Ionicons name="log-out-outline" size={18} color="#fff" />}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Semver comparison: returns true if `a` is strictly newer than `b`.
function isNewerVersion(a: string, b: string) {
  const parse = (v: string) => v.split(".").map(Number);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

function KV({ label, value }: { label: string; value: string | number }) {
  const t = useTheme();
  return (
    <View style={styles.kv}>
      <Text style={{ color: t.textMuted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 14, fontWeight: "500" }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  title: { fontSize: 24, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: "center", justifyContent: "center",
  },
  name: { fontSize: 16, fontWeight: "600" },
  muted: { fontSize: 13, marginTop: 2 },
  section: { fontSize: 13, fontWeight: "600", marginBottom: spacing.sm },
  kv: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: spacing.sm,
  },
  serverUrl: { fontSize: 13, fontFamily: "monospace" },
  updateBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
  },
  segment: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "transparent",
  },
});

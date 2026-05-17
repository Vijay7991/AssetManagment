import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { useAuth } from "@/lib/auth";
import { api, ScanResult } from "@/lib/api";
import { useTheme, spacing } from "@/lib/theme";

export default function ScanScreen() {
  const t = useTheme();
  const router = useRouter();
  const { accessToken } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOn, setScannerOn] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);

  function extractCode(raw: string): string {
    // Accept either a /t/<code> URL or a raw code
    try {
      const url = new URL(raw);
      const m = url.pathname.match(/\/t\/([A-Z0-9]+)/i);
      if (m) return m[1].toUpperCase();
    } catch {
      /* not a URL */
    }
    return raw.trim().toUpperCase();
  }

  async function lookup(raw: string) {
    const code = extractCode(raw);
    if (!code) return;
    setBusy(true); setError(null);
    try {
      // /tags/scan returns a ScanResult wrapper: either a whole-asset tag or
      // a unit-scoped tag. Route to the unit page when applicable so the user
      // jumps straight to the physical instance they scanned.
      const result = await api.get<ScanResult>(`/api/tags/scan/${code}`, accessToken);
      setScannerOn(false);
      if (result.kind === "Unit" && result.unit) {
        router.push(`/asset/${result.unit.assetId}/units/${result.unit.id}`);
      } else if (result.kind === "Asset" && result.asset) {
        router.push(`/asset/${result.asset.id}`);
      } else {
        setError(`Unexpected response for "${code}".`);
      }
    } catch (e: any) {
      if (e?.status === 404) setError(`No asset matches "${code}" in this workspace.`);
      else setError(e?.message || "Lookup failed.");
    } finally {
      setBusy(false);
    }
  }

  function handleBarcode(text: string) {
    const now = Date.now();
    const last = lastCodeRef.current;
    if (last && last.code === text && now - last.at < 1500) return;
    lastCodeRef.current = { code: text, at: now };
    lookup(text);
  }

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={["bottom"]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]}>Scan</Text>
        <Text style={[styles.subtitle, { color: t.textMuted }]}>
          Point at a QR label, or enter the code manually.
        </Text>
      </View>

      <View style={styles.cameraBox}>
        {scannerOn ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["qr", "code128", "datamatrix"],
            }}
            onBarcodeScanned={busy ? undefined : (r) => handleBarcode(r.data)}
          />
        ) : (
          <View style={[styles.cameraOff, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Ionicons name="camera-outline" size={48} color={t.textMuted} />
            <Text style={{ color: t.textMuted, marginTop: 8, fontSize: 13 }}>
              Camera off
            </Text>
          </View>
        )}
        {busy && (
          <View style={styles.overlay}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        )}
      </View>

      <View style={{ marginTop: spacing.md }}>
        {!permission.granted ? (
          <Button
            title="Grant camera access"
            onPress={requestPermission}
            fullWidth
          />
        ) : scannerOn ? (
          <Button title="Stop camera" variant="outline" onPress={() => setScannerOn(false)} fullWidth />
        ) : (
          <Button title="Start camera" onPress={() => { setScannerOn(true); setError(null); }} fullWidth />
        )}
      </View>

      {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}

      <View style={[styles.divider, { backgroundColor: t.border }]} />

      <Text style={[styles.label, { color: t.text }]}>Manual entry</Text>
      <View style={styles.manualRow}>
        <TextInput
          value={manualCode}
          onChangeText={(v) => setManualCode(v.toUpperCase())}
          placeholder="A7F3K2P9X1"
          placeholderTextColor={t.textMuted}
          autoCapitalize="characters"
          style={[
            styles.input,
            {
              color: t.text, borderColor: t.border, backgroundColor: t.surface,
              fontFamily: "monospace", letterSpacing: 1.5,
            },
          ]}
        />
        <Button
          title="Look up"
          onPress={() => manualCode.trim() && lookup(manualCode)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: spacing.lg },
  header: { marginBottom: spacing.md },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 4 },
  cameraBox: {
    aspectRatio: 1,
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  cameraOff: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 16,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  error: { fontSize: 13, marginTop: spacing.sm },
  divider: { height: 1, marginVertical: spacing.lg },
  label: { fontSize: 13, fontWeight: "500", marginBottom: spacing.sm },
  manualRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});

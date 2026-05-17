import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { useAuth, useCan } from "@/lib/auth";
import { api, ScanResult } from "@/lib/api";
import { useTheme, spacing } from "@/lib/theme";

type ScanHit = {
  code: string;
  kind: "Asset" | "Unit";
  id: string;
  assetId: string;
  name: string;
  status: string;
  assignedToName: string | null;
  assignedToUserId: string | null;
};

export default function ScanScreen() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { accessToken, user } = useAuth();
  const canCheckout = useCan("assets:checkout");
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerOn, setScannerOn] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Result shown after a single scan
  const [hit, setHit] = useState<ScanHit | null>(null);
  // Bulk scan history
  const [bulkHits, setBulkHits] = useState<ScanHit[]>([]);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);

  function extractCode(raw: string): string {
    try {
      const url = new URL(raw);
      const m = url.pathname.match(/\/t\/([A-Z0-9]+)/i);
      if (m) return m[1].toUpperCase();
    } catch {
      /* not a URL */
    }
    return raw.trim().toUpperCase();
  }

  function buildHit(code: string, result: ScanResult): ScanHit {
    if (result.kind === "Unit" && result.unit) {
      return {
        code,
        kind: "Unit",
        id: result.unit.id,
        assetId: result.unit.assetId,
        name: result.unit.assetName || code,
        status: result.unit.status,
        assignedToName: result.unit.assignedToName ?? null,
        assignedToUserId: result.unit.assignedToUserId ?? null,
      };
    }
    const a = result.asset!;
    return {
      code,
      kind: "Asset",
      id: a.id,
      assetId: a.id,
      name: a.name,
      status: a.status,
      assignedToName: a.assignedToName ?? null,
      assignedToUserId: a.assignedToUserId ?? null,
    };
  }

  async function lookup(raw: string) {
    const code = extractCode(raw);
    if (!code) return;
    setBusy(true); setError(null);
    try {
      const result = await api.get<ScanResult>(`/api/tags/scan/${code}`, accessToken);
      const h = buildHit(code, result);
      if (bulkMode) {
        setBulkHits(prev => {
          if (prev.find(x => x.code === h.code)) return prev;
          return [h, ...prev];
        });
      } else {
        setScannerOn(false);
        setHit(h);
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
    if (last && last.code === text && now - last.at < 2000) return;
    lastCodeRef.current = { code: text, at: now };
    lookup(text);
  }

  const checkout = useMutation({
    mutationFn: (h: ScanHit) => {
      const endpoint = h.kind === "Unit"
        ? `/api/units/${h.id}/check-out`
        : `/api/assets/${h.assetId}/movements`;
      const body = h.kind === "Unit"
        ? { toUserId: user?.id, notes: null, toLocation: null }
        : { kind: "CheckOut", toUserId: user?.id, notes: null, toLocation: null };
      return api.post(endpoint, body, accessToken);
    },
    onSuccess: (_data, h) => {
      qc.invalidateQueries({ queryKey: ["asset", h.assetId] });
      qc.invalidateQueries({ queryKey: ["assets"] });
      // Update hit to reflect checked-out state
      setHit(prev => prev ? { ...prev, assignedToUserId: user?.id ?? null, assignedToName: "You" } : prev);
    },
    onError: (e: any) => setError(e?.message || "Check-out failed."),
  });

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Scan</Text>
          <Text style={[styles.subtitle, { color: t.textMuted }]}>
            {bulkMode ? "Bulk mode — scan multiple items" : "Point at a QR label or enter code manually."}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            setBulkMode(b => !b);
            setHit(null);
            setBulkHits([]);
            setError(null);
          }}
          style={[styles.bulkBtn, { borderColor: bulkMode ? t.accent : t.border, backgroundColor: bulkMode ? t.accent + "22" : t.surface }]}>
          <Ionicons name="list-outline" size={16} color={bulkMode ? t.accent : t.textMuted} />
          <Text style={{ fontSize: 12, fontWeight: "600", color: bulkMode ? t.accent : t.textMuted, marginLeft: 4 }}>
            {bulkMode ? "Bulk ON" : "Bulk"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cameraBox}>
        {scannerOn ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "datamatrix"] }}
            onBarcodeScanned={busy ? undefined : (r) => handleBarcode(r.data)}
          />
        ) : (
          <View style={[styles.cameraOff, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Ionicons name="camera-outline" size={48} color={t.textMuted} />
            <Text style={{ color: t.textMuted, marginTop: 8, fontSize: 13 }}>Camera off</Text>
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
          <Button title="Grant camera access" onPress={requestPermission} fullWidth />
        ) : scannerOn ? (
          <Button title="Stop camera" variant="outline" onPress={() => setScannerOn(false)} fullWidth />
        ) : (
          <Button title="Start camera" onPress={() => { setScannerOn(true); setError(null); setHit(null); }} fullWidth />
        )}
      </View>

      {error && <Text style={[styles.error, { color: t.danger }]}>{error}</Text>}

      {/* Single-scan result panel */}
      {!bulkMode && hit && (
        <View style={[styles.resultPanel, { borderColor: t.border, backgroundColor: t.surface }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.textMuted, fontSize: 11, fontWeight: "600", textTransform: "uppercase" }}>
                {hit.kind === "Unit" ? "Unit" : "Asset"}
              </Text>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: "700", marginTop: 2 }} numberOfLines={2}>
                {hit.name}
              </Text>
              <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 2 }}>
                {hit.assignedToName ? `Checked out to ${hit.assignedToName}` : "Available"}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setHit(null)} style={{ padding: 4 }}>
              <Ionicons name="close" size={20} color={t.textMuted} />
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Button
                title="View asset"
                variant="outline"
                size="sm"
                onPress={() => {
                  setHit(null);
                  if (hit.kind === "Unit") router.push(`/asset/${hit.assetId}/units/${hit.id}`);
                  else router.push(`/asset/${hit.id}`);
                }}
                fullWidth
              />
            </View>
            {canCheckout && !hit.assignedToUserId && (
              <View style={{ flex: 1 }}>
                <Button
                  title={checkout.isPending ? "Checking out…" : "Check out to me"}
                  size="sm"
                  loading={checkout.isPending}
                  onPress={() => checkout.mutate(hit)}
                  fullWidth
                />
              </View>
            )}
            {canCheckout && hit.assignedToUserId && (
              <View style={{ flex: 1 }}>
                <Button
                  title="Check in"
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    setHit(null);
                    if (hit.kind === "Unit") router.push(`/asset/${hit.assetId}/units/${hit.id}`);
                    else router.push(`/asset/${hit.id}`);
                  }}
                  fullWidth
                />
              </View>
            )}
          </View>
        </View>
      )}

      {/* Bulk scan list */}
      {bulkMode && bulkHits.length > 0 && (
        <View style={[styles.bulkList, { borderColor: t.border }]}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <Text style={{ color: t.text, fontSize: 13, fontWeight: "600" }}>
              {bulkHits.length} scanned
            </Text>
            <TouchableOpacity onPress={() => setBulkHits([])}>
              <Text style={{ color: t.danger, fontSize: 12 }}>Clear</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 140 }} showsVerticalScrollIndicator={false}>
            {bulkHits.map(h => (
              <TouchableOpacity
                key={h.code}
                onPress={() => {
                  if (h.kind === "Unit") router.push(`/asset/${h.assetId}/units/${h.id}`);
                  else router.push(`/asset/${h.id}`);
                }}
                style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
                <Ionicons name="checkmark-circle" size={14} color={t.accent} style={{ marginRight: 6 }} />
                <Text style={{ color: t.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{h.name}</Text>
                <Text style={{ color: t.textMuted, fontSize: 11, fontFamily: "monospace" }}>{h.code}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

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
            { color: t.text, borderColor: t.border, backgroundColor: t.surface, fontFamily: "monospace", letterSpacing: 1.5 },
          ]}
        />
        <Button title="Look up" onPress={() => manualCode.trim() && lookup(manualCode)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: spacing.lg },
  header: { marginBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 4 },
  bulkBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
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
  resultPanel: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
  },
  bulkList: {
    marginTop: spacing.md,
    borderTopWidth: 1,
    paddingTop: spacing.sm,
  },
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

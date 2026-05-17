import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useCan } from "@/lib/auth";
import { api, UnitDetail } from "@/lib/api";
import { Button } from "@/components/Button";
import { Badge, Card } from "@/components/Card";
import { QrTag } from "@/components/QrTag";
import { useTheme, spacing } from "@/lib/theme";

/// Per-unit detail page. Reached either by scanning a unit-scoped QR or by
/// drilling in from an asset's unit list (added in v1.1 of the asset page).
/// Supports check-in / check-out at the unit level using the
/// /api/units/{unitId}/check-{in,out} endpoints.
export default function UnitDetailScreen() {
  const { id, unitId } = useLocalSearchParams<{ id: string; unitId: string }>();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { accessToken, user } = useAuth();
  const canCheckout = useCan("assets:checkout");
  const [modal, setModal] = useState<"CheckOut" | "CheckIn" | null>(null);

  const unit = useQuery({
    queryKey: ["unit", unitId],
    queryFn: () => api.get<UnitDetail>(`/api/units/${unitId}`, accessToken),
    enabled: !!accessToken && !!unitId,
  });

  if (unit.isLoading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: t.background }]}>
        <ActivityIndicator color={t.accent} />
      </SafeAreaView>
    );
  }
  if (!unit.data) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: t.background }]}>
        <Text style={{ color: t.danger }}>Unit not found.</Text>
      </SafeAreaView>
    );
  }

  const u = unit.data;
  const primaryTag = u.tags.find(x => x.status === "Active") || u.tags[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Card>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <TouchableOpacity onPress={() => router.push(`/asset/${id}`)}>
                <Text style={{ color: t.accent, fontSize: 13, fontWeight: "600" }}>
                  ← {u.assetName}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.title, { color: t.text }]}>Unit #{u.unitNumber}</Text>
              {u.serialNumber && (
                <Text style={[styles.subtitle, { color: t.textMuted }]}>
                  S/N {u.serialNumber}
                </Text>
              )}
            </View>
            <Badge label={prettyStatus(u.status)} variant={statusTone(u.status)} />
          </View>

          <View style={{ marginTop: spacing.md, gap: 6 }}>
            <KV label="Location" value={[u.locationName, u.locationDetail].filter(Boolean).join(" · ") || "—"} />
            <KV label="Assigned to" value={u.assignedToName || "Unassigned"} />
            {u.purchasedOn && <KV label="Purchased on" value={u.purchasedOn} />}
            {u.warrantyUntil && <KV label="Warranty until" value={u.warrantyUntil} />}
            {u.purchasePrice != null && <KV label="Purchase price" value={`$${u.purchasePrice.toFixed(2)}`} />}
          </View>
        </Card>

        {canCheckout && (
          <View style={styles.actionRow}>
            {u.assignedToUserId ? (
              <Button
                title="Check in"
                variant="outline"
                size="sm"
                icon={<Ionicons name="log-in-outline" size={16} color={t.text} />}
                onPress={() => setModal("CheckIn")}
              />
            ) : (
              <Button
                title="Check out to me"
                variant="outline"
                size="sm"
                icon={<Ionicons name="log-out-outline" size={16} color={t.text} />}
                onPress={() => setModal("CheckOut")}
              />
            )}
          </View>
        )}

        {primaryTag && (
          <Card>
            <Text style={[styles.cardTitle, { color: t.text }]}>Tag</Text>
            <View style={{ alignItems: "center", marginTop: spacing.sm }}>
              <QrTag code={primaryTag.code} size={200} />
              <Text style={[styles.tagCode, { color: t.text }]}>{primaryTag.code}</Text>
            </View>
          </Card>
        )}

        {u.fieldValues && Object.keys(u.fieldValues).length > 0 && (
          <Card>
            <Text style={[styles.cardTitle, { color: t.text }]}>Custom fields</Text>
            {Object.entries(u.fieldValues).map(([k, v]) => (
              <KV key={k} label={k} value={String(v ?? "—")} />
            ))}
          </Card>
        )}
      </ScrollView>

      {modal && (
        <UnitMovementModal
          kind={modal}
          unitId={u.id}
          currentSpot={u.locationDetail}
          defaultToUserId={modal === "CheckOut" ? user?.id ?? null : null}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            qc.invalidateQueries({ queryKey: ["unit", unitId] });
            qc.invalidateQueries({ queryKey: ["asset", id] });
            qc.invalidateQueries({ queryKey: ["assets"] });
          }}
        />
      )}
    </SafeAreaView>
  );
}

function UnitMovementModal({
  kind, unitId, currentSpot, defaultToUserId, onClose, onDone,
}: {
  kind: "CheckOut" | "CheckIn";
  unitId: string;
  currentSpot: string | null;
  defaultToUserId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTheme();
  const { accessToken } = useAuth();
  const [toLocation, setToLocation] = useState(currentSpot || "");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const submit = useMutation({
    mutationFn: () => {
      if (kind === "CheckOut") {
        return api.post(`/api/units/${unitId}/check-out`, {
          toUserId: defaultToUserId,
          toLocation: toLocation || null,
          notes: notes || null,
        }, accessToken);
      }
      return api.post(`/api/units/${unitId}/check-in`, {
        toLocation: toLocation || null,
        notes: notes || null,
      }, accessToken);
    },
    onSuccess: () => onDone(),
    onError: (e: any) => setErr(e?.message || "Action failed."),
  });

  const title = kind === "CheckOut" ? "Check out unit" : "Check in unit";

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={[styles.modal, { backgroundColor: t.background, borderColor: t.border }]}>
          <View style={styles.modalHead}>
            <Text style={[styles.modalTitle, { color: t.text }]}>{title}</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={t.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.modalLabel, { color: t.text }]}>Spot / location</Text>
          <TextInput
            value={toLocation}
            onChangeText={setToLocation}
            placeholder="e.g. Warehouse A — Shelf 3"
            placeholderTextColor={t.textMuted}
            style={[styles.modalInput, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          />

          <Text style={[styles.modalLabel, { color: t.text, marginTop: spacing.md }]}>Notes</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholder="Optional"
            placeholderTextColor={t.textMuted}
            style={[styles.modalInput, styles.modalTextarea,
              { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          />

          {err && <Text style={{ color: t.danger, fontSize: 13, marginTop: spacing.sm }}>{err}</Text>}

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="outline" onPress={onClose} fullWidth />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title={submit.isPending ? "Saving…" : title}
                onPress={() => submit.mutate()}
                loading={submit.isPending}
                fullWidth
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={styles.kvRow}>
      <Text style={{ color: t.textMuted, fontSize: 12 }}>{label}</Text>
      <Text
        style={{ color: t.text, fontSize: 13, fontWeight: "500", flex: 1, textAlign: "right" }}
        numberOfLines={2}>{value}</Text>
    </View>
  );
}

function prettyStatus(s: string): string {
  if (s === "InService") return "In Service";
  if (s === "InStorage") return "In Storage";
  if (s === "InRepair") return "In Repair";
  return s;
}

function statusTone(s: string): "default" | "success" | "warning" | "danger" {
  if (s === "InService") return "success";
  if (s === "InRepair") return "warning";
  if (s === "Retired" || s === "Lost") return "danger";
  return "default";
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontWeight: "700", marginTop: 4 },
  subtitle: { fontSize: 13, marginTop: 2 },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md },
  cardTitle: { fontSize: 14, fontWeight: "600" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tagCode: {
    fontFamily: "monospace",
    fontSize: 18,
    letterSpacing: 2,
    marginTop: spacing.sm,
    fontWeight: "600",
  },
  kvRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 3 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modal: {
    padding: spacing.lg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
  },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  modalTitle: { fontSize: 17, fontWeight: "600" },
  modalLabel: { fontSize: 13, fontWeight: "500", marginBottom: 6 },
  modalInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  modalTextarea: { minHeight: 80, textAlignVertical: "top" },
});

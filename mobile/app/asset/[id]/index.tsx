import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Image, Modal, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/Button";
import { Badge, Card, prettyStatus, statusVariant } from "@/components/Card";
import { QrTag } from "@/components/QrTag";
import { NewTicketModal } from "@/app/(tabs)/maintenance";
import { useAuth, useCan } from "@/lib/auth";
import { api, AssetDetail, Movement, UnitListItem } from "@/lib/api";
import { useTheme, spacing } from "@/lib/theme";

export default function AssetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { accessToken } = useAuth();
  const canCheckout = useCan("assets:checkout");
  const canWrite = useCan("assets:write");
  const canMaintenance = useCan("maintenance:write");

  const [movementForm, setMovementForm] = useState<null | { kind: "CheckOut" | "CheckIn" | "Move" }>(null);
  const [showTicket, setShowTicket] = useState(false);

  const asset = useQuery({
    queryKey: ["asset", id],
    queryFn: () => api.get<AssetDetail>(`/api/assets/${id}`, accessToken),
    enabled: !!accessToken && !!id,
  });

  const movements = useQuery({
    queryKey: ["movements", id],
    queryFn: () => api.get<Movement[]>(`/api/assets/${id}/movements`, accessToken),
    enabled: !!accessToken && !!id,
  });

  // Only fire the units request once we know the asset is unit-tracked;
  // saves a round-trip for the common single-instance case.
  const units = useQuery({
    queryKey: ["units", id],
    queryFn: () => api.get<UnitListItem[]>(`/api/assets/${id}/units`, accessToken),
    enabled: !!accessToken && !!id && !!asset.data?.isUnitTracked,
  });

  const uploadPhoto = useMutation({
    mutationFn: async (uri: string) => {
      // Derive a sensible filename + MIME from the picker URI extension.
      const name = uri.split("/").pop() || "photo.jpg";
      const ext = name.split(".").pop()?.toLowerCase() || "jpg";
      const type = ext === "png" ? "image/png"
                 : ext === "webp" ? "image/webp"
                 : ext === "gif" ? "image/gif"
                 : "image/jpeg";
      return api.upload(`/api/assets/${id}/photos`, { uri, name, type }, accessToken);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["asset", id] }),
    onError: (e: any) => Alert.alert("Upload failed", e?.message || "Could not upload photo."),
  });

  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to upload images.");
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({
      // expo-image-picker v17+ accepts an array of strings here; the legacy
      // MediaTypeOptions enum is deprecated and emits a runtime warning.
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
    });
    if (r.canceled || !r.assets?.length) return;
    uploadPhoto.mutate(r.assets[0].uri);
  }

  async function takeAndUpload() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow camera access to take photos.");
      return;
    }
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (r.canceled || !r.assets?.length) return;
    uploadPhoto.mutate(r.assets[0].uri);
  }

  if (asset.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={t.accent} />
      </SafeAreaView>
    );
  }
  if (!asset.data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: t.danger }}>Asset not found.</Text>
      </SafeAreaView>
    );
  }
  const a = asset.data;
  const primaryTag = a.tags.find(x => x.status === "Active") || a.tags[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={["bottom"]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: t.text }]}>{a.name}</Text>
              <Text style={[styles.subtitle, { color: t.textMuted }]}>
                {a.categoryName} · {a.assetTypeName}
              </Text>
            </View>
            <Badge label={prettyStatus(a.status)} variant={statusVariant(a.status)} />
          </View>
          {a.description && <Text style={[styles.desc, { color: t.text }]}>{a.description}</Text>}

          <View style={{ marginTop: spacing.md, gap: 6 }}>
            <KV label="Quantity" value={String(a.quantity)} />
            <KV
              label="Location"
              value={[a.locationName, a.locationDetail].filter(Boolean).join(" · ") || "—"}
            />
            <KV label="Assigned to" value={a.assignedToName || "Unassigned"} />
            {a.purchasePrice != null && <KV label="Purchase price" value={`$${a.purchasePrice.toFixed(2)}`} />}
            {a.purchasedOn && <KV label="Purchased on" value={a.purchasedOn} />}
            {a.warrantyUntil && <KV label="Warranty until" value={a.warrantyUntil} />}
          </View>

          {a.fieldValues && Object.keys(a.fieldValues).length > 0 && (
            <View style={[styles.customFields, { borderColor: t.border }]}>
              <Text style={[styles.customHead, { color: t.text }]}>Custom fields</Text>
              {Object.entries(a.fieldValues).map(([k, v]) => (
                <KV key={k} label={k} value={String(v ?? "—")} />
              ))}
            </View>
          )}
        </Card>

        {/* Action row */}
        {(canCheckout || canWrite) && (
          <View style={styles.actionRow}>
            {canCheckout && (a.assignedToUserId ? (
              <Button title="Check in" variant="outline" size="sm"
                      icon={<Ionicons name="log-in-outline" size={16} color={t.text} />}
                      onPress={() => setMovementForm({ kind: "CheckIn" })} />
            ) : (
              <Button title="Check out" variant="outline" size="sm"
                      icon={<Ionicons name="log-out-outline" size={16} color={t.text} />}
                      onPress={() => setMovementForm({ kind: "CheckOut" })} />
            ))}
            {canCheckout && (
              <Button title="Move" variant="outline" size="sm"
                      icon={<Ionicons name="navigate-outline" size={16} color={t.text} />}
                      onPress={() => setMovementForm({ kind: "Move" })} />
            )}
            {canMaintenance && (
              <Button title="New ticket" variant="outline" size="sm"
                      icon={<Ionicons name="construct-outline" size={16} color={t.text} />}
                      onPress={() => setShowTicket(true)} />
            )}
          </View>
        )}

        {/* Tag / QR */}
        {primaryTag && (
          <Card>
            <Text style={[styles.cardTitle, { color: t.text }]}>Tag</Text>
            <View style={{ alignItems: "center", marginTop: spacing.sm }}>
              <QrTag code={primaryTag.code} size={200} />
              <Text style={[styles.tagCode, { color: t.text }]}>{primaryTag.code}</Text>
            </View>
          </Card>
        )}

        {/* Photos */}
        <Card>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={[styles.cardTitle, { color: t.text }]}>
              Photos ({a.photos.length})
            </Text>
            {canWrite && (
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TouchableOpacity onPress={takeAndUpload} disabled={uploadPhoto.isPending}>
                  <Ionicons name="camera-outline" size={22} color={t.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={pickAndUpload} disabled={uploadPhoto.isPending}>
                  <Ionicons name="image-outline" size={22} color={t.accent} />
                </TouchableOpacity>
              </View>
            )}
          </View>
          {uploadPhoto.isPending && (
            <ActivityIndicator color={t.accent} style={{ marginTop: spacing.sm }} />
          )}
          {a.photos.length === 0 ? (
            <Text style={{ color: t.textMuted, fontSize: 13, marginTop: spacing.sm }}>
              {canWrite
                ? "No photos yet. Use the camera or gallery icon above to add one."
                : "No photos yet."}
            </Text>
          ) : (
            <FlatList
              data={a.photos}
              keyExtractor={p => p.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
              contentContainerStyle={{ marginTop: spacing.sm }}
              renderItem={({ item }) => (
                <Image source={{ uri: item.url }} style={styles.photo} />
              )}
            />
          )}
        </Card>

        {/* Units (only for unit-tracked assets) */}
        {a.isUnitTracked && (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={[styles.cardTitle, { color: t.text }]}>
                Units ({a.unitCount}, {a.availableUnitCount} available)
              </Text>
            </View>
            {units.isLoading && <ActivityIndicator color={t.accent} style={{ marginTop: spacing.sm }} />}
            {units.data && units.data.length === 0 && (
              <Text style={{ color: t.textMuted, fontSize: 13, marginTop: spacing.sm }}>
                No units yet. Add them from the web app.
              </Text>
            )}
            {units.data?.map(u => (
              <TouchableOpacity
                key={u.id}
                style={[styles.unitRow, { borderColor: t.border }]}
                onPress={() => router.push(`/asset/${a.id}/units/${u.id}`)}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.unitTitle, { color: t.text }]}>
                    #{u.unitNumber}{u.serialNumber ? `  ·  ${u.serialNumber}` : ""}
                  </Text>
                  <Text style={[styles.unitMeta, { color: t.textMuted }]}>
                    {u.assignedToName ? `with ${u.assignedToName}` : "Available"}
                    {u.locationName ? ` · ${u.locationName}` : ""}
                  </Text>
                </View>
                <Badge label={prettyStatus(u.status)} variant={statusVariant(u.status)} />
                <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* History */}
        <Card>
          <Text style={[styles.cardTitle, { color: t.text }]}>History</Text>
          {movements.isLoading && <ActivityIndicator color={t.accent} style={{ marginTop: spacing.sm }} />}
          {movements.data && movements.data.length === 0 && (
            <Text style={{ color: t.textMuted, fontSize: 13, marginTop: spacing.sm }}>No movements yet.</Text>
          )}
          {movements.data?.map(m => (
            <View key={m.id} style={[styles.move, { borderColor: t.border }]}>
              <Badge
                label={m.kind}
                variant={m.kind === "CheckOut" ? "warning" : m.kind === "CheckIn" ? "success" : "default"}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.moveLine, { color: t.text }]}>
                  {m.kind === "CheckOut" && m.toUserName ? `to ${m.toUserName}` :
                   m.kind === "CheckIn" && m.fromUserName ? `from ${m.fromUserName}` :
                   `${m.fromLocation || "—"} → ${m.toLocation || "—"}`}
                </Text>
                {m.notes && <Text style={[styles.moveNote, { color: t.textMuted }]}>{m.notes}</Text>}
                <Text style={[styles.moveMeta, { color: t.textMuted }]}>
                  {m.performedByName || "—"} · {new Date(m.performedAt).toLocaleString()}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>

      {showTicket && (
        <NewTicketModal
          assetId={a.id}
          assetName={a.name}
          onClose={() => setShowTicket(false)}
          onDone={() => setShowTicket(false)}
        />
      )}

      {movementForm && (
        <MovementModal
          kind={movementForm.kind}
          assetId={a.id}
          currentSpot={a.locationDetail}
          currentAssigneeName={a.assignedToName}
          onClose={() => setMovementForm(null)}
          onDone={() => {
            setMovementForm(null);
            qc.invalidateQueries({ queryKey: ["asset", id] });
            qc.invalidateQueries({ queryKey: ["movements", id] });
            qc.invalidateQueries({ queryKey: ["assets"] });
          }}
        />
      )}
    </SafeAreaView>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={styles.kvRow}>
      <Text style={{ color: t.textMuted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: t.text, fontSize: 13, fontWeight: "500", flex: 1, textAlign: "right" }}
            numberOfLines={2}>{value}</Text>
    </View>
  );
}

function MovementModal({
  kind, assetId, currentSpot, currentAssigneeName, onClose, onDone,
}: {
  kind: "CheckOut" | "CheckIn" | "Move";
  assetId: string;
  currentSpot: string | null;
  currentAssigneeName: string | null;
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
        return api.post(`/api/assets/${assetId}/check-out`, {
          toUserId: null,
          toLocation: toLocation || null,
          notes: notes || null,
        }, accessToken);
      }
      if (kind === "CheckIn") {
        return api.post(`/api/assets/${assetId}/check-in`, {
          toLocation: toLocation || null,
          notes: notes || null,
        }, accessToken);
      }
      return api.post(`/api/assets/${assetId}/move`, {
        toLocation,
        notes: notes || null,
      }, accessToken);
    },
    onSuccess: () => onDone(),
    onError: (e: any) => setErr(e?.message || "Action failed."),
  });

  const title = kind === "CheckOut" ? "Check out asset"
              : kind === "CheckIn" ? "Check in asset"
              : "Move asset";

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

          {kind === "CheckIn" && currentAssigneeName && (
            <Text style={{ color: t.textMuted, fontSize: 13, marginBottom: spacing.sm }}>
              Currently with <Text style={{ fontWeight: "600", color: t.text }}>{currentAssigneeName}</Text>.
            </Text>
          )}

          <Text style={[styles.modalLabel, { color: t.text }]}>
            {kind === "Move" ? "New spot *" : "Spot / location"}
          </Text>
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
                onPress={() => {
                  if (kind === "Move" && !toLocation) { setErr("Destination required."); return; }
                  submit.mutate();
                }}
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

const styles = StyleSheet.create({
  title: { fontSize: 20, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 2 },
  desc: { fontSize: 14, marginTop: spacing.sm, lineHeight: 20 },
  customFields: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  customHead: { fontSize: 13, fontWeight: "600", marginBottom: spacing.sm },
  kvRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md, paddingVertical: 3 },
  cardTitle: { fontSize: 14, fontWeight: "600" },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  tagCode: {
    fontFamily: "monospace",
    fontSize: 18,
    letterSpacing: 2,
    marginTop: spacing.sm,
    fontWeight: "600",
  },
  photo: { width: 120, height: 120, borderRadius: 8 },
  unitRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
    marginTop: spacing.sm,
  },
  unitTitle: { fontSize: 14, fontWeight: "600" },
  unitMeta: { fontSize: 12, marginTop: 2 },
  move: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    marginTop: spacing.sm,
  },
  moveLine: { fontSize: 13 },
  moveNote: { fontSize: 12, marginTop: 2 },
  moveMeta: { fontSize: 11, marginTop: 4 },
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
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalLabel: { fontSize: 13, fontWeight: "500", marginBottom: spacing.xs },
  modalInput: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15,
  },
  modalTextarea: { textAlignVertical: "top", minHeight: 70 },
});

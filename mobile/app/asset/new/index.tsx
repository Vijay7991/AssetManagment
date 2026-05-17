import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useCan } from "@/lib/auth";
import {
  api, AssetDetail, AssetTypeRecord, Location,
} from "@/lib/api";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useTheme, spacing } from "@/lib/theme";

const STATUSES = ["InService", "InStorage", "InRepair", "Retired", "Lost"] as const;

/// Mobile asset-create form. Mirrors the web /assets/new flow but trimmed —
/// custom fields and unit-seed grids stay web-only. From mobile you can
/// create the asset and then drill into it to add units, photos, etc.
export default function NewAssetScreen() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { accessToken } = useAuth();
  const canWrite = useCan("assets:write");

  const types = useQuery({
    queryKey: ["asset-types"],
    queryFn: () => api.get<AssetTypeRecord[]>("/api/asset-types", accessToken),
    enabled: !!accessToken,
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<Location[]>("/api/locations", accessToken),
    enabled: !!accessToken,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assetTypeId, setAssetTypeId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [locationDetail, setLocationDetail] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [status, setStatus] = useState<typeof STATUSES[number]>("InService");
  const [err, setErr] = useState<string | null>(null);

  const selectedType = useMemo(
    () => types.data?.find(x => x.id === assetTypeId),
    [types.data, assetTypeId]
  );

  const create = useMutation({
    mutationFn: () => api.post<AssetDetail>("/api/assets", {
      name: name.trim(),
      assetTypeId,
      description: description.trim() || null,
      locationId: locationId || null,
      locationDetail: locationDetail.trim() || null,
      quantity: Math.max(1, parseInt(quantity, 10) || 1),
      status,
      fieldValues: null,
      purchasePrice: null,
      purchasedOn: null,
      warrantyUntil: null,
      isUnitTracked: null,
      units: null,
    }, accessToken),
    onSuccess: (asset) => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["asset-stats"] });
      router.replace(`/asset/${asset.id}`);
    },
    onError: (e: any) => setErr(e?.message || "Could not create asset."),
  });

  if (!canWrite) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: t.background }]}>
        <Ionicons name="lock-closed-outline" size={36} color={t.textMuted} />
        <Text style={{ color: t.textMuted, marginTop: spacing.md, fontSize: 14 }}>
          You don't have permission to create assets.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }} edges={["bottom"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          <Field label="Name *">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. MacBook Pro 14-inch"
              placeholderTextColor={t.textMuted}
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
            />
          </Field>

          <Field label="Asset type *">
            {types.isLoading ? (
              <ActivityIndicator color={t.accent} />
            ) : (
              <Picker
                value={assetTypeId}
                options={(types.data || []).map(x => ({ value: x.id, label: x.name }))}
                placeholder="Choose a type"
                onChange={setAssetTypeId}
              />
            )}
            {selectedType?.trackByUnit && (
              <Text style={{ color: t.textMuted, fontSize: 12, marginTop: 4 }}>
                This type tracks each instance as a separate unit with its own
                barcode. Add units after creating from the asset's detail page.
              </Text>
            )}
          </Field>

          <Field label="Description">
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              placeholder="Optional"
              placeholderTextColor={t.textMuted}
              style={[styles.input, styles.textarea,
                { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
            />
          </Field>

          <Field label="Location">
            <Picker
              value={locationId}
              options={[{ value: "", label: "— None —" },
                       ...(locations.data || []).map(l => ({ value: l.id, label: l.name }))]}
              placeholder="Choose"
              onChange={setLocationId}
            />
          </Field>

          <Field label="Spot / shelf / rack">
            <TextInput
              value={locationDetail}
              onChangeText={setLocationDetail}
              placeholder="e.g. Bench 2 — Drawer 5"
              placeholderTextColor={t.textMuted}
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
            />
          </Field>

          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Field label="Quantity">
                <TextInput
                  value={quantity}
                  onChangeText={(v) => setQuantity(v.replace(/[^0-9]/g, "") || "1")}
                  keyboardType="number-pad"
                  style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
                />
              </Field>
            </View>
            <View style={{ flex: 2 }}>
              <Field label="Status">
                <Picker
                  value={status}
                  options={STATUSES.map(s => ({ value: s, label: prettyStatus(s) }))}
                  placeholder=""
                  onChange={(v) => setStatus(v as any)}
                />
              </Field>
            </View>
          </View>

          {err && (
            <Card style={{ borderColor: t.danger, backgroundColor: "rgba(220,38,38,0.06)" }}>
              <Text style={{ color: t.danger, fontSize: 13 }}>{err}</Text>
            </Card>
          )}

          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Button title="Cancel" variant="outline" onPress={() => router.back()} fullWidth />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                title={create.isPending ? "Creating…" : "Create"}
                onPress={() => {
                  if (!name.trim() || !assetTypeId) {
                    setErr("Name and asset type are required.");
                    return;
                  }
                  create.mutate();
                }}
                loading={create.isPending}
                fullWidth
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={{ color: t.text, fontSize: 13, fontWeight: "500" }}>{label}</Text>
      {children}
    </View>
  );
}

/// Simple inline picker built from Pressables — we deliberately avoid pulling
/// in a heavyweight @react-native-picker dep just for this. Works on Android
/// out of the box and keeps the bundle small.
function Picker({ value, options, placeholder, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <View>
      <Pressable
        onPress={() => setOpen(o => !o)}
        style={[styles.input, styles.pickerRow, { borderColor: t.border, backgroundColor: t.surface }]}>
        <Text style={{ color: current ? t.text : t.textMuted, fontSize: 15 }}>
          {current?.label || placeholder}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={t.textMuted} />
      </Pressable>
      {open && (
        <View style={[styles.pickerList, { borderColor: t.border, backgroundColor: t.surface }]}>
          {options.length === 0 && (
            <Text style={{ padding: 12, color: t.textMuted, fontSize: 13 }}>No options.</Text>
          )}
          {options.map(opt => (
            <Pressable
              key={opt.value || "_blank"}
              onPress={() => { onChange(opt.value); setOpen(false); }}
              style={({ pressed }) => [
                styles.pickerOpt,
                { borderTopColor: t.border, backgroundColor: pressed ? t.background : "transparent" },
                value === opt.value && { backgroundColor: t.background },
              ]}>
              <Text style={{ color: t.text, fontSize: 14 }}>{opt.label}</Text>
              {value === opt.value && <Ionicons name="checkmark" size={16} color={t.accent} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function prettyStatus(s: string): string {
  if (s === "InService") return "In Service";
  if (s === "InStorage") return "In Storage";
  if (s === "InRepair") return "In Repair";
  return s;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  pickerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pickerList: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 6,
    overflow: "hidden",
  },
  pickerOpt: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});

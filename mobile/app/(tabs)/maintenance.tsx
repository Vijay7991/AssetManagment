"use client";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator, FlatList, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useCan } from "@/lib/auth";
import { api, MaintenanceTicket, Paged } from "@/lib/api";
import { Badge } from "@/components/Card";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useTheme, spacing } from "@/lib/theme";

const STATUS_FILTERS = ["All", "Open", "InProgress", "Done", "Cancelled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const KIND_OPTIONS = ["Corrective", "Preventive", "Inspection"] as const;
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"] as const;

export default function MaintenanceScreen() {
  const t = useTheme();
  const router = useRouter();
  const { accessToken } = useAuth();
  const canWrite = useCan("maintenance:write");
  const [filter, setFilter] = useState<StatusFilter>("All");
  const [filterOpen, setFilterOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const list = useQuery({
    queryKey: ["maintenance", filter],
    queryFn: () => {
      const p = new URLSearchParams({ pageSize: "100" });
      if (filter !== "All") p.set("status", filter);
      return api.get<Paged<MaintenanceTicket>>(`/api/maintenance?${p}`, accessToken);
    },
    enabled: !!accessToken,
  });

  const isEmpty = !list.isLoading && list.data && list.data.items.length === 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={["top", "bottom"]}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Tickets</Text>
          <Text style={[styles.subtitle, { color: t.textMuted }]}>
            {list.data ? `${list.data.total} total` : "Loading…"}
          </Text>
        </View>
        {canWrite && (
          <TouchableOpacity
            onPress={() => setShowNew(true)}
            style={[styles.addBtn, { backgroundColor: t.primary }]}>
            <Ionicons name="add" size={22} color={t.primaryText} />
          </TouchableOpacity>
        )}
      </View>

      {/* Compact status filter dropdown */}
      <View style={{ marginBottom: spacing.md, zIndex: 10 }}>
        <Pressable
          onPress={() => setFilterOpen(o => !o)}
          style={[styles.filterBtn, { borderColor: t.border, backgroundColor: t.surface }]}>
          <Text style={{ color: t.text, fontSize: 14, fontWeight: "500" }}>
            Status: {prettyStatus(filter)}
          </Text>
          <Ionicons name={filterOpen ? "chevron-up" : "chevron-down"} size={16} color={t.textMuted} />
        </Pressable>
        {filterOpen && (
          <View style={[styles.filterList, { borderColor: t.border, backgroundColor: t.surface }]}>
            {STATUS_FILTERS.map(s => (
              <Pressable
                key={s}
                onPress={() => { setFilter(s); setFilterOpen(false); }}
                style={({ pressed }) => [
                  styles.filterOpt,
                  { borderTopColor: t.border, backgroundColor: pressed ? t.background : "transparent" },
                  filter === s && { backgroundColor: t.background },
                ]}>
                <Text style={{ color: t.text, fontSize: 14 }}>{prettyStatus(s)}</Text>
                {filter === s && <Ionicons name="checkmark" size={16} color={t.accent} />}
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {list.isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      )}

      {isEmpty && (
        <ScrollView
          contentContainerStyle={{ flex: 1 }}
          refreshControl={
            <RefreshControl
              refreshing={list.isFetching}
              onRefresh={() => list.refetch()}
              tintColor={t.accent}
            />
          }>
          <EmptyState
            title="No tickets"
            description={
              canWrite
                ? "Tap + to create a ticket, or open one from an asset's detail page."
                : "Open tickets will appear here when they're created."
            }
            icon={<Ionicons name="construct-outline" size={48} color={t.textMuted} />}
          />
        </ScrollView>
      )}

      {list.data && list.data.items.length > 0 && (
        <FlatList
          data={list.data.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: t.border }} />}
          refreshControl={
            <RefreshControl
              refreshing={list.isFetching}
              onRefresh={() => list.refetch()}
              tintColor={t.accent}
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/asset/${item.assetId}`)}>
              <View style={styles.rowMain}>
                <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.rowSub, { color: t.textMuted }]} numberOfLines={1}>
                  {item.assetName} · {item.kind}
                </Text>
                <View style={styles.metaRow}>
                  <Badge label={prettyStatus(item.status)} variant={statusTone(item.status)} />
                  <Badge label={item.priority} variant={priorityTone(item.priority)} />
                  {item.assignedToName && (
                    <Text style={{ color: t.textMuted, fontSize: 11 }}>
                      → {item.assignedToName}
                    </Text>
                  )}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
            </TouchableOpacity>
          )}
        />
      )}

      {showNew && (
        <NewTicketModal
          onClose={() => setShowNew(false)}
          onDone={() => {
            setShowNew(false);
            list.refetch();
          }}
          assetId={null}
          assetName={null}
        />
      )}
    </SafeAreaView>
  );
}

export function NewTicketModal({
  assetId, assetName, onClose, onDone,
}: {
  assetId: string | null;
  assetName: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTheme();
  const { accessToken } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<string>("Corrective");
  const [priority, setPriority] = useState<string>("Medium");
  const [err, setErr] = useState<string | null>(null);

  // Asset search when no assetId provided
  const [assetQ, setAssetQ] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(assetId);
  const [selectedAssetName, setSelectedAssetName] = useState<string | null>(assetName);

  const assetSearch = useQuery({
    queryKey: ["assets-search", assetQ],
    queryFn: () => api.get<{ items: { id: string; name: string }[] }>(
      `/api/assets?q=${encodeURIComponent(assetQ)}&pageSize=8`, accessToken
    ),
    enabled: !!accessToken && !assetId && assetQ.length >= 2,
  });

  const submit = useMutation({
    mutationFn: () => {
      const aid = selectedAssetId;
      if (!aid) throw new Error("Select an asset.");
      if (!title.trim()) throw new Error("Title is required.");
      return api.post("/api/maintenance", {
        assetId: aid,
        title: title.trim(),
        description: description.trim() || null,
        kind,
        priority,
        assignedToUserId: null,
        scheduledFor: null,
        cost: null,
      }, accessToken);
    },
    onSuccess: onDone,
    onError: (e: any) => setErr(e?.message || "Could not create ticket."),
  });

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={[styles.modal, { backgroundColor: t.background, borderColor: t.border }]}>
          <View style={styles.modalHead}>
            <Text style={[styles.modalTitle, { color: t.text }]}>New maintenance ticket</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={t.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Asset picker when not pre-bound to an asset */}
            {!assetId && (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={[styles.label, { color: t.text }]}>Asset *</Text>
                {selectedAssetId ? (
                  <Pressable
                    onPress={() => { setSelectedAssetId(null); setSelectedAssetName(null); setAssetQ(""); }}
                    style={[styles.input, { borderColor: t.accent, backgroundColor: t.surface, flexDirection: "row", justifyContent: "space-between" }]}>
                    <Text style={{ color: t.text, fontSize: 14 }}>{selectedAssetName}</Text>
                    <Ionicons name="close-circle" size={18} color={t.textMuted} />
                  </Pressable>
                ) : (
                  <>
                    <TextInput
                      value={assetQ}
                      onChangeText={setAssetQ}
                      placeholder="Search asset name…"
                      placeholderTextColor={t.textMuted}
                      style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
                    />
                    {assetSearch.data?.items && assetSearch.data.items.length > 0 && (
                      <View style={[styles.filterList, { borderColor: t.border, backgroundColor: t.surface }]}>
                        {assetSearch.data.items.map(a => (
                          <Pressable
                            key={a.id}
                            onPress={() => { setSelectedAssetId(a.id); setSelectedAssetName(a.name); setAssetQ(""); }}
                            style={[styles.filterOpt, { borderTopColor: t.border }]}>
                            <Text style={{ color: t.text, fontSize: 14 }}>{a.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {assetId && (
              <View style={{ marginBottom: spacing.md }}>
                <Text style={[styles.label, { color: t.text }]}>Asset</Text>
                <Text style={{ color: t.textMuted, fontSize: 14, paddingVertical: 4 }}>{assetName}</Text>
              </View>
            )}

            <Text style={[styles.label, { color: t.text }]}>Title *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Replace worn belt"
              placeholderTextColor={t.textMuted}
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface, marginBottom: spacing.md }]}
            />

            <Text style={[styles.label, { color: t.text }]}>Description</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              placeholder="Optional details"
              placeholderTextColor={t.textMuted}
              style={[styles.input, styles.textarea,
                { color: t.text, borderColor: t.border, backgroundColor: t.surface, marginBottom: spacing.md }]}
            />

            <View style={{ flexDirection: "row", gap: spacing.md, marginBottom: spacing.md }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: t.text }]}>Kind</Text>
                <InlineSelect
                  value={kind}
                  options={KIND_OPTIONS as unknown as string[]}
                  onChange={setKind}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: t.text }]}>Priority</Text>
                <InlineSelect
                  value={priority}
                  options={PRIORITY_OPTIONS as unknown as string[]}
                  onChange={setPriority}
                />
              </View>
            </View>

            {err && <Text style={{ color: t.danger, fontSize: 13, marginBottom: spacing.sm }}>{err}</Text>}

            <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button title="Cancel" variant="outline" onPress={onClose} fullWidth />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title={submit.isPending ? "Saving…" : "Create ticket"}
                  onPress={() => submit.mutate()}
                  loading={submit.isPending}
                  fullWidth
                />
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function InlineSelect({ value, options, onChange }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen(o => !o)}
        style={[styles.filterBtn, { borderColor: t.border, backgroundColor: t.surface }]}>
        <Text style={{ color: t.text, fontSize: 13 }}>{value}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={14} color={t.textMuted} />
      </Pressable>
      {open && (
        <View style={[styles.filterList, { borderColor: t.border, backgroundColor: t.surface, zIndex: 20 }]}>
          {options.map(o => (
            <Pressable
              key={o}
              onPress={() => { onChange(o); setOpen(false); }}
              style={[styles.filterOpt, { borderTopColor: t.border }]}>
              <Text style={{ color: t.text, fontSize: 13 }}>{o}</Text>
              {value === o && <Ionicons name="checkmark" size={14} color={t.accent} />}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

function prettyStatus(s: string) {
  return s === "InProgress" ? "In Progress" : s;
}

function statusTone(s: string): "default" | "success" | "warning" | "danger" {
  if (s === "Open") return "warning";
  if (s === "InProgress") return "default";
  if (s === "Done") return "success";
  if (s === "Cancelled") return "danger";
  return "default";
}

function priorityTone(p: string): "default" | "success" | "warning" | "danger" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warning";
  return "default";
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: spacing.lg },
  header: { marginBottom: spacing.md, flexDirection: "row", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 4 },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  filterList: {
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 4,
    overflow: "hidden",
  },
  filterOpt: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
  },
  rowMain: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowSub: { fontSize: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modal: {
    maxHeight: "85%",
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
  label: { fontSize: 13, fontWeight: "500", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  textarea: { minHeight: 70, textAlignVertical: "top" },
});

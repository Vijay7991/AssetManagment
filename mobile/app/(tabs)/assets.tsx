import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, Modal, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useCan } from "@/lib/auth";
import { api, AssetListItem, Location, Paged } from "@/lib/api";
import { useTheme, spacing } from "@/lib/theme";
import { Badge, prettyStatus, statusVariant } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "InService", label: "In Service" },
  { value: "InStorage", label: "In Storage" },
  { value: "InRepair", label: "In Repair" },
  { value: "Retired", label: "Retired" },
  { value: "Lost", label: "Lost" },
] as const;

export default function AssetsScreen() {
  const t = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    status?: string;
    warrantyExpiring?: string;
    locationId?: string;
  }>();
  const { accessToken } = useAuth();
  const canWrite = useCan("assets:write");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [warrantyExpiring, setWarrantyExpiring] = useState(false);

  // Sync filters from incoming route params (dashboard KPI taps land here with
  // ?status=…, ?warrantyExpiring=true, etc.)
  useEffect(() => {
    if (params.status !== undefined) setStatusFilter(params.status || "");
    if (params.warrantyExpiring !== undefined) setWarrantyExpiring(params.warrantyExpiring === "true");
    if (params.locationId !== undefined) setLocationFilter(params.locationId || "");
  }, [params.status, params.warrantyExpiring, params.locationId]);

  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: () => api.get<Location[]>("/api/locations", accessToken),
    enabled: !!accessToken,
  });

  const list = useQuery({
    queryKey: ["assets", q, statusFilter, locationFilter, warrantyExpiring],
    queryFn: () => {
      const p = new URLSearchParams({ pageSize: "100" });
      if (q) p.set("q", q);
      if (statusFilter) p.set("status", statusFilter);
      if (locationFilter) p.set("locationId", locationFilter);
      if (warrantyExpiring) p.set("warrantyExpiring", "true");
      return api.get<Paged<AssetListItem>>(`/api/assets?${p}`, accessToken);
    },
    enabled: !!accessToken,
  });

  const activeLocationName = locations.data?.find(l => l.id === locationFilter)?.name;
  const hasActiveFilter = !!statusFilter || !!locationFilter || warrantyExpiring;

  function clearAll() {
    setStatusFilter("");
    setLocationFilter("");
    setWarrantyExpiring(false);
    setQ("");
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Assets</Text>
          <Text style={[styles.subtitle, { color: t.textMuted }]}>
            {list.data ? `${list.data.total} total` : "Loading…"}
          </Text>
        </View>
        {canWrite && (
          <TouchableOpacity
            onPress={() => router.push("/asset/new")}
            style={[styles.addBtn, { backgroundColor: t.primary }]}>
            <Ionicons name="add" size={22} color={t.primaryText} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.searchRow, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Ionicons name="search-outline" size={18} color={t.textMuted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search by name or description"
          placeholderTextColor={t.textMuted}
          style={[styles.searchInput, { color: t.text }]}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {q.length > 0 && (
          <TouchableOpacity onPress={() => setQ("")}>
            <Ionicons name="close-circle" size={18} color={t.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Status filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        {STATUS_FILTERS.map(f => {
          const active = statusFilter === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setStatusFilter(active ? "" : f.value)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? t.primary : t.surface,
                  borderColor: active ? t.primary : t.border,
                },
              ]}>
              <Text style={{ color: active ? t.primaryText : t.text, fontSize: 12, fontWeight: "600" }}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Secondary filters: location + warranty */}
      <View style={styles.secondaryRow}>
        <Pressable
          onPress={() => setLocationPickerOpen(true)}
          style={[styles.secondaryBtn, { borderColor: locationFilter ? t.accent : t.border, backgroundColor: t.surface }]}>
          <Ionicons name="location-outline" size={14} color={locationFilter ? t.accent : t.textMuted} />
          <Text style={{ color: locationFilter ? t.accent : t.text, fontSize: 12, fontWeight: "600", marginLeft: 4 }}
                numberOfLines={1}>
            {activeLocationName || "All locations"}
          </Text>
          <Ionicons name="chevron-down" size={12} color={t.textMuted} style={{ marginLeft: 2 }} />
        </Pressable>

        <Pressable
          onPress={() => setWarrantyExpiring(v => !v)}
          style={[styles.secondaryBtn, {
            borderColor: warrantyExpiring ? t.danger : t.border,
            backgroundColor: warrantyExpiring ? t.danger + "18" : t.surface,
          }]}>
          <Ionicons name="alarm-outline" size={14} color={warrantyExpiring ? t.danger : t.textMuted} />
          <Text style={{ color: warrantyExpiring ? t.danger : t.text, fontSize: 12, fontWeight: "600", marginLeft: 4 }}>
            Warranty &lt; 30d
          </Text>
        </Pressable>

        {hasActiveFilter && (
          <Pressable onPress={clearAll} style={[styles.secondaryBtn, { borderColor: t.border, backgroundColor: t.surface }]}>
            <Ionicons name="close" size={14} color={t.textMuted} />
            <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: "600", marginLeft: 4 }}>Clear</Text>
          </Pressable>
        )}
      </View>

      {list.isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      )}

      {list.data && list.data.items.length === 0 && (
        <ScrollView
          contentContainerStyle={{ flex: 1 }}
          refreshControl={
            <RefreshControl refreshing={list.isFetching} onRefresh={() => list.refetch()} tintColor={t.accent} />
          }>
          <EmptyState
            title="No assets match"
            description={hasActiveFilter || q ? "Try clearing the search or filter." : "Create your first asset to get started."}
            icon={<Ionicons name="cube-outline" size={48} color={t.textMuted} />}
          />
        </ScrollView>
      )}

      {list.data && list.data.items.length > 0 && (
        <FlatList
          data={list.data.items}
          keyExtractor={(a) => a.id}
          contentContainerStyle={{ paddingTop: spacing.sm, paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: t.border }} />}
          refreshControl={
            <RefreshControl refreshing={list.isFetching} onRefresh={() => list.refetch()} tintColor={t.accent} />
          }
          renderItem={({ item: a }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/asset/${a.id}`)}>
              <View style={[styles.thumb, { backgroundColor: t.surface }]}>
                {a.coverPhotoUrl ? (
                  <Image source={{ uri: a.coverPhotoUrl }} style={styles.thumbImg} />
                ) : (
                  <Ionicons name="cube-outline" size={22} color={t.textMuted} />
                )}
              </View>
              <View style={styles.rowMain}>
                <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={1}>{a.name}</Text>
                <Text style={[styles.rowSub, { color: t.textMuted }]} numberOfLines={1}>
                  {a.assetType}
                  {a.locationName ? ` · ${a.locationName}` : ""}
                  {a.locationDetail ? ` · ${a.locationDetail}` : ""}
                </Text>
                {a.primaryTagCode && (
                  <Text style={[styles.rowCode, { color: t.textMuted }]}>{a.primaryTagCode}</Text>
                )}
              </View>
              <Badge label={prettyStatus(a.status)} variant={statusVariant(a.status)} />
            </TouchableOpacity>
          )}
        />
      )}

      {/* Location picker modal */}
      <Modal visible={locationPickerOpen} transparent animationType="slide" onRequestClose={() => setLocationPickerOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setLocationPickerOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.modalSheet, { backgroundColor: t.background, borderColor: t.border }]}>
            <View style={styles.modalHead}>
              <Text style={{ color: t.text, fontSize: 16, fontWeight: "600" }}>Filter by location</Text>
              <TouchableOpacity onPress={() => setLocationPickerOpen(false)}>
                <Ionicons name="close" size={22} color={t.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }}>
              <Pressable
                onPress={() => { setLocationFilter(""); setLocationPickerOpen(false); }}
                style={[styles.locOpt, { borderBottomColor: t.border }]}>
                <Text style={{ color: t.text, fontSize: 15 }}>All locations</Text>
                {!locationFilter && <Ionicons name="checkmark" size={18} color={t.accent} />}
              </Pressable>
              {locations.data?.map(loc => (
                <Pressable
                  key={loc.id}
                  onPress={() => { setLocationFilter(loc.id); setLocationPickerOpen(false); }}
                  style={[styles.locOpt, { borderBottomColor: t.border }]}>
                  <Text style={{ color: t.text, fontSize: 15 }}>{loc.name}</Text>
                  {locationFilter === loc.id && <Ionicons name="checkmark" size={18} color={t.accent} />}
                </Pressable>
              ))}
              {(!locations.data || locations.data.length === 0) && (
                <Text style={{ color: t.textMuted, fontSize: 13, padding: spacing.lg, textAlign: "center" }}>
                  No locations yet. Create them from the web app.
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: spacing.lg },
  header: {
    marginBottom: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 4 },
  addBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: spacing.sm,
  },
  searchInput: { flex: 1, fontSize: 15 },
  filterRow: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: 2,
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  secondaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    maxWidth: 200,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: 12,
  },
  thumb: {
    width: 44, height: 44, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  thumbImg: { width: 44, height: 44 },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowCode: { fontSize: 11, fontFamily: "monospace", marginTop: 2 },
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    padding: spacing.lg,
  },
  modalHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  locOpt: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
});

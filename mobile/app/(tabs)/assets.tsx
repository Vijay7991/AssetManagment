import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator, FlatList, Image, Pressable, RefreshControl,
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
  const [statusOpen, setStatusOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
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

      {/* Compact single-row filter: Status / Location dropdowns + warranty toggle */}
      <View style={[styles.filterRow, { zIndex: 10 }]}>
        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => { setStatusOpen(o => !o); setLocationOpen(false); }}
            style={[styles.filterBtn, { borderColor: statusFilter ? t.accent : t.border, backgroundColor: t.surface }]}>
            <Text style={{ color: statusFilter ? t.accent : t.text, fontSize: 12, fontWeight: "600", flex: 1 }} numberOfLines={1}>
              {STATUS_FILTERS.find(f => f.value === statusFilter)?.label || "All status"}
            </Text>
            <Ionicons name={statusOpen ? "chevron-up" : "chevron-down"} size={12} color={t.textMuted} />
          </Pressable>
          {statusOpen && (
            <View style={[styles.filterList, { borderColor: t.border, backgroundColor: t.surface }]}>
              {STATUS_FILTERS.map(f => (
                <Pressable
                  key={f.value}
                  onPress={() => { setStatusFilter(f.value); setStatusOpen(false); }}
                  style={[styles.filterOpt, { borderTopColor: t.border }]}>
                  <Text style={{ color: t.text, fontSize: 13 }}>{f.label}</Text>
                  {statusFilter === f.value && <Ionicons name="checkmark" size={14} color={t.accent} />}
                </Pressable>
              ))}
            </View>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Pressable
            onPress={() => { setLocationOpen(o => !o); setStatusOpen(false); }}
            style={[styles.filterBtn, { borderColor: locationFilter ? t.accent : t.border, backgroundColor: t.surface }]}>
            <Text style={{ color: locationFilter ? t.accent : t.text, fontSize: 12, fontWeight: "600", flex: 1 }} numberOfLines={1}>
              {activeLocationName || "All locations"}
            </Text>
            <Ionicons name={locationOpen ? "chevron-up" : "chevron-down"} size={12} color={t.textMuted} />
          </Pressable>
          {locationOpen && (
            <View style={[styles.filterList, { borderColor: t.border, backgroundColor: t.surface, maxHeight: 280 }]}>
              <ScrollView nestedScrollEnabled>
                <Pressable
                  onPress={() => { setLocationFilter(""); setLocationOpen(false); }}
                  style={[styles.filterOpt, { borderTopColor: t.border }]}>
                  <Text style={{ color: t.text, fontSize: 13 }}>All locations</Text>
                  {!locationFilter && <Ionicons name="checkmark" size={14} color={t.accent} />}
                </Pressable>
                {locations.data?.map(loc => (
                  <Pressable
                    key={loc.id}
                    onPress={() => { setLocationFilter(loc.id); setLocationOpen(false); }}
                    style={[styles.filterOpt, { borderTopColor: t.border }]}>
                    <Text style={{ color: t.text, fontSize: 13 }} numberOfLines={1}>{loc.name}</Text>
                    {locationFilter === loc.id && <Ionicons name="checkmark" size={14} color={t.accent} />}
                  </Pressable>
                ))}
                {(!locations.data || locations.data.length === 0) && (
                  <Text style={{ color: t.textMuted, fontSize: 12, padding: spacing.md }}>No locations yet.</Text>
                )}
              </ScrollView>
            </View>
          )}
        </View>

        <Pressable
          onPress={() => setWarrantyExpiring(v => !v)}
          style={[styles.iconBtn, {
            borderColor: warrantyExpiring ? t.danger : t.border,
            backgroundColor: warrantyExpiring ? t.danger + "18" : t.surface,
          }]}>
          <Ionicons name="alarm-outline" size={16} color={warrantyExpiring ? t.danger : t.textMuted} />
        </Pressable>

        {hasActiveFilter && (
          <Pressable onPress={clearAll} style={[styles.iconBtn, { borderColor: t.border, backgroundColor: t.surface }]}>
            <Ionicons name="close" size={16} color={t.textMuted} />
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
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  filterBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  filterList: {
    position: "absolute",
    top: 38,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 10,
    overflow: "hidden",
    zIndex: 20,
    elevation: 4,
  },
  filterOpt: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
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
});

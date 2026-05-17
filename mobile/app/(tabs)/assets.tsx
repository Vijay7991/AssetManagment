import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator, FlatList, Image, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useCan } from "@/lib/auth";
import { api, AssetListItem, Paged } from "@/lib/api";
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
  const { accessToken } = useAuth();
  const canWrite = useCan("assets:write");
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const list = useQuery({
    queryKey: ["assets", q, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ pageSize: "100" });
      if (q) params.set("q", q);
      if (statusFilter) params.set("status", statusFilter);
      return api.get<Paged<AssetListItem>>(`/api/assets?${params}`, accessToken);
    },
    enabled: !!accessToken,
  });

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
            description={q || statusFilter ? "Try clearing the search or filter." : "Create your first asset from the web app."}
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
    gap: spacing.sm,
    paddingBottom: spacing.md,
    paddingTop: 2,
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
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

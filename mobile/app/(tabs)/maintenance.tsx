import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth, useCan } from "@/lib/auth";
import { api, MaintenanceTicket, Paged } from "@/lib/api";
import { Badge } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { useTheme, spacing } from "@/lib/theme";

const STATUS_FILTERS = ["All", "Open", "InProgress", "Done", "Cancelled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

/// Maintenance tickets list — supports the same status filter the web app
/// exposes and links to the per-asset detail page so the user can pick up
/// where they left off. Creating tickets stays a web-only flow for v1.
export default function MaintenanceScreen() {
  const t = useTheme();
  const router = useRouter();
  const { accessToken } = useAuth();
  const canWrite = useCan("maintenance:write");
  const [filter, setFilter] = useState<StatusFilter>("All");

  const list = useQuery({
    queryKey: ["maintenance", filter],
    queryFn: () => {
      const p = new URLSearchParams({ pageSize: "100" });
      if (filter !== "All") p.set("status", filter);
      return api.get<Paged<MaintenanceTicket>>(`/api/maintenance?${p}`, accessToken);
    },
    enabled: !!accessToken,
  });

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Tickets</Text>
          <Text style={[styles.subtitle, { color: t.textMuted }]}>
            {list.data ? `${list.data.total} total` : "Loading…"}
          </Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}>
        {STATUS_FILTERS.map(s => {
          const active = filter === s;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => setFilter(s)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? t.primary : t.surface,
                  borderColor: active ? t.primary : t.border,
                },
              ]}>
              <Text style={{
                color: active ? t.primaryText : t.text,
                fontSize: 12, fontWeight: "600",
              }}>{prettyStatus(s)}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {list.isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      )}

      {list.data && list.data.items.length === 0 && (
        <EmptyState
          title="No tickets"
          description={
            canWrite
              ? "Create maintenance tickets from the web app or from an asset's detail page."
              : "Open tickets will appear here when they're created."
          }
          icon={<Ionicons name="construct-outline" size={48} color={t.textMuted} />}
        />
      )}

      {list.data && list.data.items.length > 0 && (
        <FlatList
          data={list.data.items}
          keyExtractor={(t) => t.id}
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
    </SafeAreaView>
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
  filterRow: { gap: spacing.sm, paddingBottom: spacing.md },
  chip: {
    paddingVertical: 6,
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
  rowMain: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowSub: { fontSize: 12 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 2 },
});

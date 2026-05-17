import { useState } from "react";
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { api, AuditEvent, Paged } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { useTheme, spacing } from "@/lib/theme";

const VERB_ICON: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  Created:       { name: "add-circle-outline",     color: "#22c55e" },
  Updated:       { name: "create-outline",          color: "#3b82f6" },
  Deleted:       { name: "trash-outline",           color: "#ef4444" },
  CheckedOut:    { name: "log-out-outline",         color: "#f59e0b" },
  CheckedIn:     { name: "log-in-outline",          color: "#22c55e" },
  Moved:         { name: "navigate-outline",        color: "#8b5cf6" },
  Imported:      { name: "cloud-download-outline",  color: "#6b7280" },
  StatusChanged: { name: "swap-horizontal-outline", color: "#6b7280" },
};

export default function ActivityScreen() {
  const t = useTheme();
  const router = useRouter();
  const { accessToken } = useAuth();
  const [page, setPage] = useState(1);

  const list = useQuery({
    queryKey: ["audit", page],
    queryFn: () => api.get<Paged<AuditEvent>>(`/api/audit?page=${page}&pageSize=50`, accessToken),
    enabled: !!accessToken,
    staleTime: 30_000,
  });

  const items = list.data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 50));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Activity</Text>
          <Text style={[styles.subtitle, { color: t.textMuted }]}>
            {list.data ? `${list.data.total} events` : "Loading…"}
          </Text>
        </View>
      </View>

      {list.isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      )}

      {!list.isLoading && items.length === 0 && (
        <EmptyState
          title="No activity yet"
          description="Actions taken on assets — creates, check-outs, moves — appear here."
          icon={<Ionicons name="pulse-outline" size={48} color={t.textMuted} />}
        />
      )}

      {items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: t.border }} />}
          refreshControl={
            <RefreshControl
              refreshing={list.isFetching}
              onRefresh={() => { setPage(1); list.refetch(); }}
              tintColor={t.accent}
            />
          }
          ListFooterComponent={
            totalPages > 1 ? (
              <View style={styles.pagination}>
                <TouchableOpacity
                  disabled={page <= 1}
                  onPress={() => setPage(p => p - 1)}
                  style={[styles.pageBtn, { borderColor: t.border, opacity: page <= 1 ? 0.4 : 1 }]}>
                  <Ionicons name="chevron-back" size={18} color={t.text} />
                </TouchableOpacity>
                <Text style={{ color: t.textMuted, fontSize: 13 }}>
                  Page {page} / {totalPages}
                </Text>
                <TouchableOpacity
                  disabled={page >= totalPages}
                  onPress={() => setPage(p => p + 1)}
                  style={[styles.pageBtn, { borderColor: t.border, opacity: page >= totalPages ? 0.4 : 1 }]}>
                  <Ionicons name="chevron-forward" size={18} color={t.text} />
                </TouchableOpacity>
              </View>
            ) : null
          }
          renderItem={({ item: e }) => {
            const icon = VERB_ICON[e.verb] ?? { name: "ellipse-outline" as keyof typeof Ionicons.glyphMap, color: t.textMuted };
            return (
              <TouchableOpacity
                style={styles.row}
                onPress={() => {
                  if (e.entityType === "Asset" && e.entityId) {
                    router.push(`/asset/${e.entityId}`);
                  }
                }}
                activeOpacity={e.entityType === "Asset" && e.entityId ? 0.7 : 1}>
                <View style={[styles.iconWrap, { backgroundColor: icon.color + "18" }]}>
                  <Ionicons name={icon.name} size={18} color={icon.color} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[styles.verb, { color: icon.color }]}>{e.verb}</Text>
                    <Text style={[styles.entity, { color: t.textMuted }]}>{e.entityType}</Text>
                  </View>
                  <Text style={[styles.summary, { color: t.text }]} numberOfLines={2}>
                    {e.summary}
                  </Text>
                  <Text style={[styles.meta, { color: t.textMuted }]}>
                    {e.actorEmail || "System"} · {formatRelative(e.at)}
                  </Text>
                </View>
                {e.entityType === "Asset" && e.entityId && (
                  <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString();
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: spacing.lg },
  header: { marginBottom: spacing.md, flexDirection: "row", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: 12,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  verb: { fontSize: 12, fontWeight: "700" },
  entity: { fontSize: 11 },
  summary: { fontSize: 13, marginTop: 2 },
  meta: { fontSize: 11, marginTop: 3 },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  pageBtn: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 6,
  },
});

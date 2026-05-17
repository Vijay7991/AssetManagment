import { useRouter } from "expo-router";
import {
  ActivityIndicator, FlatList, RefreshControl, StyleSheet,
  Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { api, Notification } from "@/lib/api";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { useTheme, spacing } from "@/lib/theme";

/// In-app notifications. Tapping a notification marks it read and (if the
/// notification has a link pointing to an asset) routes there. We deliberately
/// keep this list flat — the web app shows the same thing.
export default function NotificationsScreen() {
  const t = useTheme();
  const router = useRouter();
  const qc = useQueryClient();
  const { accessToken } = useAuth();

  const list = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<Notification[]>("/api/notifications", accessToken),
    enabled: !!accessToken,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/api/notifications/${id}/read`, undefined, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.post("/api/notifications/read-all", undefined, accessToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["notifications-unread-count"] });
    },
  });

  const unreadCount = list.data?.filter(n => !n.readAt).length ?? 0;

  /// Notification links are like "/assets/<id>" or "/assets/<id>/units/<id>".
  /// We translate that to mobile's /asset/<id> route. Unrecognised links are
  /// ignored — better than crashing on a route that doesn't exist.
  function openLink(n: Notification) {
    if (!n.readAt) markRead.mutate(n.id);
    if (!n.link) return;
    const m = n.link.match(/^\/assets\/([0-9a-fA-F-]{36})(?:\/units\/([0-9a-fA-F-]{36}))?/);
    if (m) {
      if (m[2]) router.push(`/asset/${m[1]}/units/${m[2]}`);
      else router.push(`/asset/${m[1]}`);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Inbox</Text>
          <Text style={[styles.subtitle, { color: t.textMuted }]}>
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </Text>
        </View>
        {unreadCount > 0 && (
          <Button
            title="Mark all read"
            size="sm"
            variant="outline"
            onPress={() => markAll.mutate()}
            loading={markAll.isPending}
          />
        )}
      </View>

      {list.isLoading && (
        <View style={styles.center}>
          <ActivityIndicator color={t.accent} />
        </View>
      )}

      {list.data && list.data.length === 0 && (
        <EmptyState
          title="No notifications yet"
          description="You'll be notified here when assets are assigned to you, tickets are updated, or warranties are about to expire."
          icon={<Ionicons name="notifications-outline" size={48} color={t.textMuted} />}
        />
      )}

      {list.data && list.data.length > 0 && (
        <FlatList
          data={list.data}
          keyExtractor={(n) => n.id}
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
              onPress={() => openLink(item)}
              style={[styles.row, !item.readAt && { backgroundColor: "rgba(46,117,182,0.06)" }]}>
              {!item.readAt && <View style={[styles.dot, { backgroundColor: t.accent }]} />}
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: t.text }]} numberOfLines={2}>
                  {item.title}
                </Text>
                {item.body && (
                  <Text style={[styles.rowBody, { color: t.textMuted }]} numberOfLines={3}>
                    {item.body}
                  </Text>
                )}
                <Text style={[styles.rowMeta, { color: t.textMuted }]}>
                  {formatRelative(item.createdAt)}
                </Text>
              </View>
              {item.link && <Ionicons name="chevron-forward" size={18} color={t.textMuted} />}
            </TouchableOpacity>
          )}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 13, marginTop: 4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  dot: {
    width: 8, height: 8, borderRadius: 4, marginTop: 6,
  },
  rowTitle: { fontSize: 14, fontWeight: "600" },
  rowBody: { fontSize: 13, marginTop: 4, lineHeight: 18 },
  rowMeta: { fontSize: 11, marginTop: 6 },
});

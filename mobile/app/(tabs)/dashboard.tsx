import { useRouter } from "expo-router";
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/lib/auth";
import { api, AssetListItem, Paged } from "@/lib/api";
import { Card } from "@/components/Card";
import { useTheme, spacing } from "@/lib/theme";

/// Dashboard mirrors the web /dashboard page: total asset KPI, status
/// breakdown, warranty-expiring count, and a list of recently added assets.
/// We use the same /api/assets/stats endpoint the web app does.
type Stats = {
  total: number;
  byStatus: { status: string; count: number }[];
  recentlyAdded: { id: string; name: string; createdAt: string }[];
  warrantyExpiringSoon: number;
};

export default function DashboardScreen() {
  const t = useTheme();
  const router = useRouter();
  const { accessToken, user, activeTenant } = useAuth();

  const stats = useQuery({
    queryKey: ["asset-stats"],
    queryFn: () => api.get<Stats>("/api/assets/stats", accessToken),
    enabled: !!accessToken,
  });

  const recent = useQuery({
    queryKey: ["assets-recent"],
    queryFn: () => api.get<Paged<AssetListItem>>("/api/assets?page=1&pageSize=5", accessToken),
    enabled: !!accessToken,
  });

  const inService = stats.data?.byStatus.find(s => s.status === "InService")?.count ?? 0;
  const inRepair = stats.data?.byStatus.find(s => s.status === "InRepair")?.count ?? 0;

  const refreshing = stats.isRefetching || recent.isRefetching;
  function onRefresh() {
    stats.refetch();
    recent.refetch();
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.background }]} edges={["top", "bottom"]}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}>
        <View>
          <Text style={[styles.greeting, { color: t.textMuted }]}>
            Hello{user?.displayName ? `, ${user.displayName.split(" ")[0]}` : ""}
          </Text>
          <Text style={[styles.title, { color: t.text }]}>
            {activeTenant?.name || "AssetHub"}
          </Text>
        </View>

        <View style={styles.kpiRow}>
          <Kpi label="Total" value={stats.data?.total ?? "—"} icon="cube" />
          <Kpi label="In service" value={inService} icon="checkmark-circle" tone="success" />
        </View>
        <View style={styles.kpiRow}>
          <Kpi label="In repair" value={inRepair} icon="construct" tone="warning" />
          <Kpi
            label="Warranty < 30d"
            value={stats.data?.warrantyExpiringSoon ?? 0}
            icon="alarm"
            tone="danger"
          />
        </View>

        <View style={styles.quickRow}>
          <Quick label="Scan" icon="qr-code-outline" onPress={() => router.push("/(tabs)/scan")} />
          <Quick label="Assets" icon="cube-outline" onPress={() => router.push("/(tabs)/assets")} />
          <Quick label="Tickets" icon="construct-outline" onPress={() => router.push("/(tabs)/maintenance")} />
          <Quick label="Inbox" icon="notifications-outline" onPress={() => router.push("/(tabs)/notifications")} />
        </View>

        <Card>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: t.text }]}>Recently added</Text>
            <TouchableOpacity onPress={() => router.push("/(tabs)/assets")}>
              <Text style={{ color: t.accent, fontSize: 13, fontWeight: "600" }}>See all</Text>
            </TouchableOpacity>
          </View>

          {recent.isLoading && <ActivityIndicator color={t.accent} style={{ marginTop: spacing.sm }} />}
          {recent.data && recent.data.items.length === 0 && (
            <Text style={{ color: t.textMuted, fontSize: 13, marginTop: spacing.sm }}>
              No assets yet. Create one from the web app to get started.
            </Text>
          )}
          {recent.data?.items.map(a => (
            <TouchableOpacity
              key={a.id}
              style={[styles.recentRow, { borderColor: t.border }]}
              onPress={() => router.push(`/asset/${a.id}`)}>
              <Ionicons name="cube-outline" size={20} color={t.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 14 }} numberOfLines={1}>{a.name}</Text>
                <Text style={{ color: t.textMuted, fontSize: 12 }} numberOfLines={1}>
                  {a.assetType}{a.locationName ? ` · ${a.locationName}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
            </TouchableOpacity>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

function Kpi({ label, value, icon, tone }: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "success" | "warning" | "danger";
}) {
  const t = useTheme();
  const color = tone === "success" ? t.success
              : tone === "warning" ? t.warning
              : tone === "danger" ? t.danger
              : t.accent;
  return (
    <View style={[styles.kpi, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.kpiHead}>
        <Ionicons name={icon} size={16} color={color} />
        <Text style={{ color: t.textMuted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      </View>
      <Text style={[styles.kpiValue, { color: t.text }]}>{value}</Text>
    </View>
  );
}

function Quick({ label, icon, onPress }: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.quick, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Ionicons name={icon} size={22} color={t.text} />
      <Text style={{ color: t.text, fontSize: 11, fontWeight: "600", marginTop: 4 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  greeting: { fontSize: 13 },
  title: { fontSize: 22, fontWeight: "700", marginTop: 2 },
  kpiRow: { flexDirection: "row", gap: spacing.md },
  kpi: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: spacing.md,
    gap: 6,
  },
  kpiHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  kpiValue: { fontSize: 24, fontWeight: "700" },
  quickRow: { flexDirection: "row", gap: spacing.sm },
  quick: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontSize: 14, fontWeight: "600" },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
    marginTop: spacing.sm,
  },
});

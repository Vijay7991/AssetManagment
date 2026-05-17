import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
// We use @expo/vector-icons (Ionicons) — bundled with Expo, no extra deps.
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";

/// Bottom tab bar. The Notifications tab gets a small dot when unread items
/// exist; we poll the unread-count endpoint every 60s so the badge stays
/// roughly in sync without a websocket.
export default function TabsLayout() {
  const t = useTheme();
  const router = useRouter();
  const { user, loading, accessToken } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/(auth)/login");
  }, [loading, user, router]);

  const unread = useQuery({
    queryKey: ["notifications-unread-count"],
    queryFn: () => api.get<{ count: number }>("/api/notifications/unread-count", accessToken),
    enabled: !!accessToken,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const unreadCount = unread.data?.count ?? 0;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.textMuted,
        tabBarStyle: {
          backgroundColor: t.background,
          borderTopColor: t.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}>
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color, size }) => <Ionicons name="qr-code-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="assets"
        options={{
          title: "Assets",
          tabBarIcon: ({ color, size }) => <Ionicons name="cube-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="maintenance"
        options={{
          title: "Tickets",
          tabBarIcon: ({ color, size }) => <Ionicons name="construct-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "Inbox",
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="notifications-outline" color={color} size={size} />
              {unreadCount > 0 && (
                <View style={[styles.badge, { backgroundColor: t.danger, borderColor: t.background }]}>
                  <Text style={styles.badgeText}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    right: -8,
    top: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 2,
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
});

import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

/// Entry: route the user based on whether they're signed in.
/// We default to the production server (https://www.asset-hub.uk) so the
/// app works out-of-the-box on first install — no setup screen needed.
/// Users can still change the server from Profile → Server.
export default function Index() {
  const router = useRouter();
  const t = useTheme();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (user) router.replace("/(tabs)/scan");
    else router.replace("/(auth)/login");
  }, [loading, user, router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.background }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

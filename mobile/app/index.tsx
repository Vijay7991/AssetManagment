import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/lib/auth";
import { getServerUrl } from "@/lib/server";
import { useTheme } from "@/lib/theme";

/// Entry: pick a route based on (server URL set?) and (logged in?).
export default function Index() {
  const router = useRouter();
  const t = useTheme();
  const { user, loading } = useAuth();
  const [serverChecked, setServerChecked] = useState(false);

  useEffect(() => {
    (async () => {
      const url = await getServerUrl();
      if (!url) {
        router.replace("/setup");
        return;
      }
      setServerChecked(true);
    })();
  }, [router]);

  useEffect(() => {
    if (!serverChecked || loading) return;
    if (user) router.replace("/(tabs)/scan");
    else router.replace("/(auth)/login");
  }, [serverChecked, loading, user, router]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.background }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}

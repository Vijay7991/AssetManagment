import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { BiometricGate } from "@/components/BiometricGate";

export default function RootLayout() {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        // RN apps don't have a focus event in the browser sense; we still
        // refetch on app-foreground via TanStack's built-in AppState listener.
        refetchOnWindowFocus: false,
      },
    },
  }));

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={qc}>
          <ThemeProvider>
          <AuthProvider>
            <BiometricGate>
            <StatusBar style="auto" />
            <Stack
              screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="setup" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="asset/[id]/index"
                options={{ headerShown: true, title: "Asset" }} />
              <Stack.Screen
                name="asset/[id]/units/[unitId]"
                options={{ headerShown: true, title: "Unit" }} />
              <Stack.Screen
                name="asset/new/index"
                options={{ headerShown: true, title: "New asset" }} />
            </Stack>
            </BiometricGate>
          </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

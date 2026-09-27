import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "@/i18n";

import { colors } from "@/theme/tokens";

/**
 * Root layout (M1): providers only. The tracking task import (CLAUDE.md hard
 * rule 4) and the real session/role gate arrive in M8/M5.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <View style={styles.flex}>
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.background },
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(onboarding)" />
              <Stack.Screen name="(driver)" />
              <Stack.Screen name="(console)" />
              <Stack.Screen name="access-notice" />
              <Stack.Screen name="dev" />
            </Stack>
          </View>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

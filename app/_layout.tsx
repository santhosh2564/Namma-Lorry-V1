// The background location task MUST be defined before anything else runs
// (CLAUDE.md hard rule 4): the OS can launch the app headlessly and invoke the
// task before a single screen renders, and `TaskManager.defineTask` only
// registers a handler if it has already been evaluated. Importing it first
// makes that order explicit rather than incidental.
import "@/tracking/task";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import "@/i18n";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAuthStore } from "@/features/auth/store";
import { useAuthBootstrap } from "@/features/auth/useAuthBootstrap";
import { initSentry, setSentryUser, wrapWithSentry } from "@/lib/sentry";
import { useAppFonts } from "@/theme/fonts";
import { colors } from "@/theme/tokens";

// Crash reporting starts before the first render (B4). A no-op without a DSN.
initSentry();

/**
 * Root layout: providers, fonts, and the auth bootstrap that resolves the
 * session and the local tracking state. `app/index.tsx` (S1) then runs the
 * routing gate. The background tracking task is registered by the import at the
 * very top of this file (CLAUDE.md hard rule 4). Render crashes land in the
 * error boundary and Sentry; the background task itself never reports (no
 * network I/O inside the task, hard rule 4).
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 30_000,
    },
  },
});

function RootLayout() {
  // Noto Sans + Material Symbols (M2). Keep the app hidden until fonts are
  // ready, but never block forever if a font fails to load.
  const [fontsLoaded, fontError] = useAppFonts();
  useAuthBootstrap();

  // Crash reports carry the signed-in user's opaque id, never phone or name.
  const userId = useAuthStore((state) => state.userId);
  useEffect(() => setSentryUser(userId), [userId]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <View style={styles.flex}>
            <StatusBar style="dark" />
            <ErrorBoundary>
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
            </ErrorBoundary>
          </View>
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

export default wrapWithSentry(RootLayout);

const styles = StyleSheet.create({
  flex: { flex: 1 },
});

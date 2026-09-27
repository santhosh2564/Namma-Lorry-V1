// Must be the first import: the background location task has to be defined at module
// top level before the app renders, including when the OS wakes the app headless (TRD §4.2).
import '@/tracking/task';

import {
  NotoSans_400Regular,
  NotoSans_500Medium,
  NotoSans_600SemiBold,
  NotoSans_700Bold,
  useFonts,
} from '@expo-google-fonts/noto-sans';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppErrorBoundary, RouteErrorBoundary } from '@/components/ErrorBoundary';
import { startAuthListener, useAuthStore } from '@/features/auth/store';
import { restoreLanguage } from '@/features/settings/language';
import { LanguageSync } from '@/features/settings/LanguageSync';
import { driverAppPlatform } from '@/lib/devDriverWeb';
import { errorInfo } from '@/lib/errorMessage';
import { initSentry, reportError, setSentryUser, wrapRoot } from '@/lib/sentry';
import { startTrackingRuntime } from '@/tracking/runtime';
import { colors } from '@/theme/tokens';

initSentry();
void SplashScreen.preventAutoHideAsync();

/** Server errors worth a report: not offline, not an expired session, not a user mistake. */
const EXPECTED = new Set(['NETWORK', 'TIMEOUT', 'SESSION_EXPIRED', 'UNAUTHENTICATED', 'RATE_LIMITED']);
const reportUnexpected = (e: unknown, kind: string) => {
  if (!EXPECTED.has(errorInfo(e).code)) reportError(e, { source: kind });
};

/** Expo Router shows this for any error thrown while rendering a route (M12a). */
export const ErrorBoundary = RouteErrorBoundary;

function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 2 } },
        queryCache: new QueryCache({ onError: (e) => reportUnexpected(e, 'query') }),
        mutationCache: new MutationCache({ onError: (e) => reportUnexpected(e, 'mutation') }),
      }),
  );
  const [languageReady, setLanguageReady] = useState(false);
  const [fontsLoaded, fontError] = useFonts({
    NotoSans_400Regular,
    NotoSans_500Medium,
    NotoSans_600SemiBold,
    NotoSans_700Bold,
  });

  useEffect(() => startAuthListener(), []);
  // Error reports carry the user's UUID only (src/lib/sentry.ts).
  useEffect(() => useAuthStore.subscribe((s) => setSentryUser(s.session?.user.id ?? null)), []);
  // The language last used on this phone, before the first screen shows (then LanguageSync
  // applies the signed-in user's saved language).
  useEffect(() => void restoreLanguage().finally(() => setLanguageReady(true)), []);
  // Upload loop + resume of an interrupted trip (native only; web never runs trips).
  useEffect(() => (driverAppPlatform ? startTrackingRuntime() : undefined), []);

  useEffect(() => {
    if ((fontsLoaded || fontError) && languageReady) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError, languageReady]);

  if ((!fontsLoaded && !fontError) || !languageReady) return null;

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <LanguageSync />
          <Stack
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
          />
        </SafeAreaProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

export default wrapRoot(RootLayout);

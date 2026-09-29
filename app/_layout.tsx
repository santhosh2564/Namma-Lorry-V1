import '../src/i18n';

import NetInfo from '@react-native-community/netinfo';
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Misconfigured } from '@/components/Misconfigured';
import { restoreLanguage } from '@/i18n/language';
import { configError } from '@/lib/config';
import { initSentry, reportError, wrapWithSentry } from '@/lib/sentry';

// The tracking task (M8) must be imported here at module top level, first.
// Placeholder note until src/tracking/task.ts exists.

initSentry();
void restoreLanguage();
// Fail closed (R0): a release build with a broken env reports it and never starts the app.
if (configError) reportError(new Error(configError), { kind: 'config' });

// Native has no browser online/visibility events: feed TanStack Query from NetInfo and
// AppState so data screens refetch after reconnect and when the app returns to the foreground.
if (Platform.OS !== 'web') {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
  );
  AppState.addEventListener('change', (status) => focusManager.setFocused(status === 'active'));
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 15_000, gcTime: 5 * 60_000 },
  },
});

function RootLayout() {
  if (configError) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Misconfigured />
      </SafeAreaProvider>
    );
  }
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default wrapWithSentry(RootLayout);

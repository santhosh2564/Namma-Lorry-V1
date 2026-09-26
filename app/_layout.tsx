import '../src/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// The tracking task (M8) must be imported here at module top level, first.
// Placeholder note until src/tracking/task.ts exists.

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 15_000, gcTime: 5 * 60_000 },
  },
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { t } from '@/i18n';
import { reportError } from '@/lib/sentry';
import { colors, space } from '@/theme/tokens';

/**
 * Crash screen (M12a). Never shows the error text: it can contain data, and it means nothing to
 * a driver. Trip recording is unaffected: the background task and SQLite queue live outside React.
 */
export function ErrorFallback({ onRetry, onHome }: { onRetry: () => void; onHome?: () => void }) {
  return (
    <View style={styles.box} accessibilityRole="alert" testID="error-boundary">
      <MaterialIcons name="error-outline" size={48} color={colors.danger} />
      <Text variant="title" align="center" accessibilityRole="header">
        {t.errorBoundary.title}
      </Text>
      <Text tone="secondary" align="center">
        {t.errorBoundary.body}
      </Text>
      <Button label={t.errorBoundary.retry} icon="refresh" onPress={onRetry} testID="error-retry" />
      {onHome ? <Button label={t.errorBoundary.home} variant="text" onPress={onHome} /> : null}
    </View>
  );
}

/** Expo Router route-level boundary (exported as `ErrorBoundary` from app/_layout.tsx). */
export function RouteErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => reportError(error, { boundary: 'route' }), [error]);
  return <ErrorFallback onRetry={() => void retry()} onHome={() => router.replace('/')} />;
}

/** Outermost boundary: catches errors in the root layout and providers themselves. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { boundary: 'app', componentStack: info.componentStack ?? undefined });
  }

  render() {
    if (this.state.failed) return <ErrorFallback onRetry={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
    backgroundColor: colors.background,
  },
});

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import i18n from '@/i18n';
import { reportError } from '@/lib/sentry';
import { colors, sizes } from '@/theme/tokens';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Global error boundary (root layout). A render crash shows a calm, translated
 * fallback with "Try again" instead of a white screen, and is reported to Sentry
 * (scrubbed). Tracking state lives in SQLite/the background task, not React, so a
 * UI crash never stops an active trip.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    reportError(error, { componentStack: info.componentStack });
  }

  private retry = () => this.setState({ error: null });

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.screen} accessibilityRole="alert" testID="error-boundary">
        <Text style={styles.title} accessibilityRole="header">
          {i18n.t('errors.boundaryTitle')}
        </Text>
        <Text style={styles.body}>{i18n.t('errors.boundaryBody')}</Text>
        <Pressable
          onPress={this.retry}
          accessibilityRole="button"
          accessibilityLabel={i18n.t('errors.boundaryRetry')}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{i18n.t('errors.boundaryRetry')}</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.background,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  body: {
    color: colors.textSecondary,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    minHeight: sizes.driverPrimary,
    minWidth: 200,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
});

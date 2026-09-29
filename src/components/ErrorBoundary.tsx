import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Button } from "@/components/ui";
import i18n from "@/i18n";
import { reportError } from "@/lib/sentry";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Global error boundary (root layout; validation report B4).
 *
 * A render crash shows a calm, translated fallback with "Try again" instead of
 * a white screen, and is reported to Sentry (scrubbed). The raw error text is
 * never shown. Tracking state lives in SQLite and the background task, not in
 * React, so a UI crash never stops an active trip.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    reportError(error, { componentStack: info.componentStack });
  }

  private retry = (): void => this.setState({ error: null });

  override render(): ReactNode {
    if (this.state.error === null) {
      return this.props.children;
    }
    return (
      <View accessibilityRole="alert" style={styles.screen} testID="error-boundary">
        <Text accessibilityRole="header" style={styles.title}>
          {i18n.t("common.errorBoundary.title")}
        </Text>
        <Text style={styles.body}>{i18n.t("common.errorBoundary.body")}</Text>
        <Button
          label={i18n.t("common.errorBoundary.retry")}
          onPress={this.retry}
          size="driver"
          testID="error-boundary-retry"
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.subtitle,
    color: colors.text,
    textAlign: "center",
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 360,
  },
});

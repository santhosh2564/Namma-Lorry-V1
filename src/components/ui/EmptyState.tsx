import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

export type EmptyStateProps = {
  /** Material Symbols ligature, e.g. "local_shipping" or "inbox". */
  icon?: string;
  title: string;
  message?: string;
  /** Optional call to action. */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Centred empty/zero-data state with an icon, title and optional action. */
export function EmptyState({
  icon = "inbox",
  title,
  message,
  action,
  style,
  testID,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      <View style={styles.iconCircle}>
        <Icon name={icon} size={32} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    padding: spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: fontSize.subtitle,
    color: colors.text,
    textAlign: "center",
  },
  message: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 320,
  },
  action: { marginTop: spacing.sm },
});

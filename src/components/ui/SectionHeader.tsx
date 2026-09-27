import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

export type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  /** Trailing action, e.g. a text button. */
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Section title with an optional subtitle and trailing action. */
export function SectionHeader({ title, subtitle, action, style, testID }: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  texts: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.subtitle, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
});

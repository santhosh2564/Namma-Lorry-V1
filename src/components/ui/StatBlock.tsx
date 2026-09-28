import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, lineHeight, spacing } from "@/theme/tokens";

export type StatBlockProps = {
  /** Big tabular number, e.g. "512 km" or "9h 42m". */
  value: string;
  label: string;
  caption?: string;
  size?: "sm" | "md" | "lg";
  align?: "left" | "center" | "right";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * NB: the keys are `size`/`line`, not `value`/`line`.
 *
 * The worklets babel plugin (pulled in by `babel-preset-expo`, shared with
 * Reanimated) rewrites **any** inline-style property read as `.value` — `s.value`
 * in a style object looks exactly like a Reanimated shared value to it, so it
 * wraps the read in a `require("react-native-reanimated")` warning closure. That
 * put a needless Reanimated dependency in every render of the D5/D6 stat rows
 * and made the component untestable under Jest.
 */
const sizes = {
  sm: { size: fontSize.title, line: lineHeight.title },
  md: { size: fontSize.heading, line: lineHeight.heading },
  lg: { size: fontSize.display, line: lineHeight.display },
} as const;

/** Big bold tabular number with a label — km, time, counts. */
export function StatBlock({
  value,
  label,
  caption,
  size = "md",
  align = "left",
  style,
  testID,
}: StatBlockProps) {
  const s = sizes[size];
  return (
    <View style={[styles.container, { alignItems: alignToFlex(align) }, style]} testID={testID}>
      <Text style={[styles.value, { fontSize: s.size, lineHeight: s.line }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

function alignToFlex(align: "left" | "center" | "right") {
  if (align === "center") return "center" as const;
  if (align === "right") return "flex-end" as const;
  return "flex-start" as const;
}

const styles = StyleSheet.create({
  container: { gap: spacing.xxs },
  value: { fontFamily: fonts.bold, color: colors.text, fontVariant: ["tabular-nums"] },
  label: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.textSecondary },
  caption: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textDisabled },
});

import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import { colors, fonts, fontSize, spacing, touch } from "@/theme/tokens";

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Material Symbols ligature shown in a leading circle. */
  icon?: string;
  iconColor?: string;
  /** Trailing text, e.g. a value or status. */
  value?: string;
  valueColor?: string;
  /** Trailing custom node (overrides `value`). */
  right?: ReactNode;
  /** Shows a chevron and makes the row pressable. */
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Standard list row: optional leading icon, title/subtitle, trailing value. */
export function ListRow({
  title,
  subtitle,
  icon,
  iconColor = colors.primary,
  value,
  valueColor = colors.textSecondary,
  right,
  onPress,
  disabled = false,
  style,
  testID,
}: ListRowProps) {
  const content = (
    <View style={styles.inner}>
      {icon ? (
        <View style={styles.iconCircle}>
          <Icon name={icon} size={20} color={iconColor} />
        </View>
      ) : null}
      <View style={styles.texts}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? (
        <View style={styles.trailing}>
          {value ? <Text style={[styles.value, { color: valueColor }]}>{value}</Text> : null}
          {onPress ? <Icon name="chevron_right" size={22} color={colors.textDisabled} /> : null}
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          pressed ? styles.pressed : null,
          disabled ? styles.disabled : null,
          style,
        ]}
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={[styles.row, style]} testID={testID}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touch.min,
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  inner: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  pressed: { backgroundColor: colors.surfaceAlt },
  disabled: { opacity: 0.5 },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  texts: { flex: 1, gap: 2 },
  title: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  trailing: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  value: { fontFamily: fonts.medium, fontSize: fontSize.body },
});

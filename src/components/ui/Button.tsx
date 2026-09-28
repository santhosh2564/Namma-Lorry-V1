import type { StyleProp, ViewStyle } from "react-native";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import { borderWidth, colors, fonts, radii, spacing, touch } from "@/theme/tokens";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  /** Red outline — a destructive action that is not the default choice yet (D5's END TRIP). */
  | "dangerOutline"
  | "success"
  | "outline"
  | "text";

export type ButtonSize = "sm" | "md" | "lg" | "driver";

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Material Symbols ligature shown before the label. */
  icon?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type VariantStyle = {
  container: ViewStyle;
  pressed: ViewStyle;
  label: { color: string };
  spinner: string;
};

const variants: Record<ButtonVariant, VariantStyle> = {
  primary: {
    container: { backgroundColor: colors.primary },
    pressed: { backgroundColor: colors.primaryPressed },
    label: { color: colors.onPrimary },
    spinner: colors.onPrimary,
  },
  secondary: {
    container: { backgroundColor: colors.primaryMuted },
    pressed: { backgroundColor: colors.border },
    label: { color: colors.primary },
    spinner: colors.primary,
  },
  danger: {
    container: { backgroundColor: colors.rejected },
    pressed: { backgroundColor: colors.rejectedPressed },
    label: { color: colors.onPrimary },
    spinner: colors.onPrimary,
  },
  success: {
    container: { backgroundColor: colors.verified },
    pressed: { backgroundColor: colors.verifiedPressed },
    label: { color: colors.onPrimary },
    spinner: colors.onPrimary,
  },
  dangerOutline: {
    container: {
      backgroundColor: colors.transparent,
      borderWidth: borderWidth.hairline,
      borderColor: colors.rejected,
    },
    pressed: { backgroundColor: colors.rejectedMuted },
    label: { color: colors.rejected },
    spinner: colors.rejected,
  },
  outline: {
    container: {
      backgroundColor: colors.transparent,
      borderWidth: borderWidth.hairline,
      borderColor: colors.borderStrong,
    },
    pressed: { backgroundColor: colors.surfaceAlt },
    label: { color: colors.primary },
    spinner: colors.primary,
  },
  text: {
    container: { backgroundColor: colors.transparent },
    pressed: { backgroundColor: colors.surfaceAlt },
    label: { color: colors.primary },
    spinner: colors.primary,
  },
};

const sizes: Record<ButtonSize, { height: number; fontSize: number }> = {
  sm: { height: touch.min, fontSize: 14 },
  md: { height: touch.min, fontSize: 16 },
  lg: { height: touch.cta, fontSize: 16 },
  driver: { height: touch.driverPrimary, fontSize: 18 },
};

/** Primary interactive control. Driver primary buttons are full-width, 64 px. */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  style,
  testID,
}: ButtonProps) {
  const v = variants[variant];
  const s = sizes[size];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { minHeight: s.height },
        v.container,
        fullWidth ? styles.fullWidth : null,
        pressed && !inactive ? v.pressed : null,
        inactive ? styles.disabled : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.spinner} size="small" />
      ) : (
        <View style={styles.content}>
          {icon ? <Icon name={icon} size={s.fontSize + 4} color={v.label.color} /> : null}
          <Text style={[styles.label, { fontSize: s.fontSize, color: v.label.color }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.button,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fullWidth: { alignSelf: "stretch" },
  disabled: { opacity: 0.5 },
  content: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { fontFamily: fonts.semibold },
});

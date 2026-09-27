import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import { borderWidth, colors, fonts, fontSize, radii, spacing } from "@/theme/tokens";

export type BannerVariant = "info" | "success" | "warning" | "error" | "offline";

export type BannerProps = {
  variant?: BannerVariant;
  title?: string;
  message: string;
  /** Optional trailing action, e.g. "Open settings". */
  actionLabel?: string;
  onAction?: () => void;
  /** Shows a dismiss (×) button when provided. */
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type VariantStyle = { bg: string; fg: string; icon: string };

const variants: Record<BannerVariant, VariantStyle> = {
  info: { bg: colors.liveMuted, fg: colors.live, icon: "info" },
  success: { bg: colors.verifiedMuted, fg: colors.verified, icon: "check_circle" },
  warning: { bg: colors.reviewMuted, fg: colors.review, icon: "warning" },
  error: { bg: colors.rejectedMuted, fg: colors.rejected, icon: "error" },
  offline: { bg: colors.reviewMuted, fg: colors.review, icon: "cloud_off" },
};

/** Inline message strip: info, success, warning, error or offline. */
export function Banner({
  variant = "info",
  title,
  message,
  actionLabel,
  onAction,
  onDismiss,
  style,
  testID,
}: BannerProps) {
  const v = variants[variant];

  return (
    <View
      accessibilityRole="alert"
      style={[styles.banner, { backgroundColor: v.bg }, style]}
      testID={testID}
    >
      <Icon name={v.icon} size={20} color={v.fg} />
      <View style={styles.body}>
        {title ? <Text style={[styles.title, { color: v.fg }]}>{title}</Text> : null}
        <Text style={styles.message}>{message}</Text>
        {actionLabel ? (
          <Text
            accessibilityRole="button"
            onPress={onAction}
            style={[styles.action, { color: v.fg }]}
          >
            {actionLabel}
          </Text>
        ) : null}
      </View>
      {onDismiss ? (
        <Pressable accessibilityLabel="Dismiss" accessibilityRole="button" onPress={onDismiss}>
          <Icon name="close" size={18} color={v.fg} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: borderWidth.hairline,
    borderColor: colors.transparent,
  },
  body: { flex: 1, gap: spacing.xxs },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.body },
  message: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.text },
  action: { fontFamily: fonts.semibold, fontSize: fontSize.caption, marginTop: spacing.xs },
});

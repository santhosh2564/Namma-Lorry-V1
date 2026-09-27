import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet, Text, View } from "react-native";

import { Icon } from "./Icon";
import type { StatusVariant, TripStatus } from "@/theme/status";
import { tripStatusMeta } from "@/theme/status";
import { borderWidth, colors, fonts, radii, spacing } from "@/theme/tokens";

export type ChipTone =
  "neutral" | "accent" | "primary" | "verified" | "review" | "rejected" | "live";

const tones: Record<ChipTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.neutralMuted, fg: colors.neutral },
  accent: { bg: colors.accentMuted, fg: colors.onAccent },
  primary: { bg: colors.primaryMuted, fg: colors.primary },
  verified: { bg: colors.verifiedMuted, fg: colors.verified },
  review: { bg: colors.reviewMuted, fg: colors.review },
  rejected: { bg: colors.rejectedMuted, fg: colors.rejected },
  live: { bg: colors.liveMuted, fg: colors.live },
};

export type ChipProps = {
  label: string;
  tone?: ChipTone;
  icon?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Small fully-rounded label — Load IDs, filters, tags. */
export function Chip({ label, tone = "neutral", icon, style, testID }: ChipProps) {
  const t = tones[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }, style]} testID={testID}>
      {icon ? <Icon name={icon} size={14} color={t.fg} /> : null}
      <Text style={[styles.chipLabel, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const variantTone: Record<StatusVariant, ChipTone> = {
  outlined: "primary",
  live: "live",
  verifying: "neutral",
  verified: "verified",
  review: "review",
  rejected: "rejected",
  neutral: "neutral",
};

export type StatusChipProps = {
  status: TripStatus;
  /** "driver" (default) or "console" label wording from docs/06 §5. */
  audience?: "driver" | "console";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * Trip-status chip. Always renders text + icon + colour together so status is
 * never communicated by colour alone (DESIGN.md).
 */
export function StatusChip({ status, audience = "driver", style, testID }: StatusChipProps) {
  const meta = tripStatusMeta(status);
  const tone = variantTone[meta.variant];
  const t = tones[tone];
  const label = audience === "console" ? meta.consoleLabel : meta.driverLabel;

  // Outlined variant ("Ready to start") is a navy outline rather than a fill.
  const outlined = meta.variant === "outlined";

  return (
    <View
      style={[
        styles.chip,
        outlined
          ? {
              backgroundColor: colors.transparent,
              borderWidth: borderWidth.hairline,
              borderColor: colors.primary,
            }
          : { backgroundColor: t.bg },
        style,
      ]}
      testID={testID ?? `status-chip-${status}`}
    >
      <Icon name={meta.icon} size={14} color={outlined ? colors.primary : t.fg} />
      <Text style={[styles.chipLabel, { color: outlined ? colors.primary : t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.chip,
  },
  chipLabel: { fontFamily: fonts.semibold, fontSize: 13 },
});

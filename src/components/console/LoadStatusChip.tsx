import { StyleSheet, Text, View } from "react-native";

import type { ChipTone } from "@/components/ui/Chip";
import type { LoadStatus } from "@/features/loads/schemas";
import { colors, fonts, radii, spacing } from "@/theme/tokens";

/**
 * The C2 load-status chip (ND-20).
 *
 * This is deliberately *not* `StatusChip`: that one renders a `trips.status`,
 * and a load has no status column. This renders the four dispatch states the
 * tabs are built from, so a dispatcher scanning the board sees "needs a driver"
 * rather than having to infer it from a trip.
 *
 * Every chip is text plus a dot, never colour alone (DESIGN.md).
 */
const TONES: Record<LoadStatus, { tone: ChipTone; dot: string }> = {
  unassigned: { tone: "accent", dot: colors.accent },
  assigned: { tone: "primary", dot: colors.primary },
  in_trip: { tone: "live", dot: colors.live },
  done: { tone: "verified", dot: colors.verified },
};

const LABELS: Record<LoadStatus, string> = {
  unassigned: "console.loads.filterUnassigned",
  assigned: "console.loads.filterAssigned",
  in_trip: "console.loads.filterInTrip",
  done: "console.loads.filterDone",
};

const DOT_BG: Record<ChipTone, string> = {
  neutral: colors.neutral,
  accent: colors.accent,
  primary: colors.primary,
  verified: colors.verified,
  review: colors.review,
  rejected: colors.rejected,
  live: colors.live,
};

const TINT: Record<ChipTone, string> = {
  neutral: colors.neutralMuted,
  accent: colors.accentMuted,
  primary: colors.primaryMuted,
  verified: colors.verifiedMuted,
  review: colors.reviewMuted,
  rejected: colors.rejectedMuted,
  live: colors.liveMuted,
};

const INK: Record<ChipTone, string> = {
  neutral: colors.neutral,
  accent: colors.onAccent,
  primary: colors.primary,
  verified: colors.verified,
  review: colors.review,
  rejected: colors.rejected,
  live: colors.live,
};

export type LoadStatusChipProps = {
  status: LoadStatus;
  /** Translated label; the screen owns `t` so the chip stays presentational. */
  label: string;
  testID?: string;
};

export function LoadStatusChip({ status, label, testID }: LoadStatusChipProps) {
  const { tone } = TONES[status];
  return (
    <View
      style={[styles.chip, { backgroundColor: TINT[tone] }]}
      testID={testID ?? `load-status-${status}`}
    >
      <View style={[styles.dot, { backgroundColor: DOT_BG[tone] }]} />
      <Text style={[styles.label, { color: INK[tone] }]}>{label}</Text>
    </View>
  );
}

/** i18n key for a derived status, for screens that call `t` themselves. */
export function loadStatusLabelKey(status: LoadStatus): string {
  return LABELS[status];
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
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontFamily: fonts.semibold, fontSize: 13 },
});

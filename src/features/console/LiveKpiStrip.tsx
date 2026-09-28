/**
 * C1 KPI strip (M11, docs/12 C1).
 *
 * "6 live · 1 stale · 12 assigned today · 3 need review" sits above the map as
 * the answer to "how is the morning going" before anyone reads a list. The
 * numbers come from `liveState.kpiStrip`, so the strip can never disagree with
 * the board underneath it.
 */
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import type { LiveKpi } from "@/features/console/liveState";
import { colors, fonts, fontSize, radii, spacing } from "@/theme/tokens";

const LABEL_KEYS: Record<LiveKpi["key"], string> = {
  live: "console.live.kpiLive",
  stale: "console.live.kpiStale",
  assignedToday: "console.live.kpiAssignedToday",
  needsReview: "console.live.kpiNeedsReview",
};

export type LiveKpiStripProps = {
  kpis: LiveKpi[];
};

export function LiveKpiStrip({ kpis }: LiveKpiStripProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.strip} testID="live-kpi-strip">
      {kpis.map((kpi) => (
        <View key={kpi.key} style={styles.cell} testID={`live-kpi-${kpi.key}`}>
          <Text style={styles.value}>{kpi.value}</Text>
          <Text style={styles.label}>{t(LABEL_KEYS[kpi.key])}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", gap: spacing.md },
  cell: {
    flex: 1,
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  value: {
    fontFamily: fonts.bold,
    fontSize: fontSize.heading,
    lineHeight: 34,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  label: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
});

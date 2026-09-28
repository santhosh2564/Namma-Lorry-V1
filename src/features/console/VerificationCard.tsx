/**
 * C6 verification card (M11, docs/12 C6).
 *
 * Two things the reviewer needs and nothing else: why this trip was flagged, and
 * the numbers the verifier measured. The reason chips show the raw code
 * (because the operator will cross-check it against the database) with the
 * driver's plain-language sentence underneath and, for the two geofence flags,
 * how far off it was.
 */
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Card, Chip, SectionHeader } from "@/components/ui";
import {
  metricsGrid,
  reasonChips,
  reasonDistanceKey,
  type VerificationMetrics,
} from "@/features/console/verificationState";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

export type VerificationCardProps = {
  reasons: string[];
  metrics: VerificationMetrics;
  /** True while `verify_trip` has not run: the grid is empty, not zeroed. */
  pending: boolean;
};

export function VerificationCard({ reasons, metrics, pending }: VerificationCardProps) {
  const { t } = useTranslation();
  const chips = reasonChips(reasons, metrics);
  const cells = metricsGrid(metrics);

  return (
    <Card testID="verification-card">
      <SectionHeader
        subtitle={
          pending
            ? t("console.trip.verificationPending")
            : reasons.length === 0
              ? t("console.trip.verificationClean")
              : t("console.trip.verificationReasons", { count: reasons.length })
        }
        title={t("console.trip.verification")}
      />

      {chips.length === 0 ? null : (
        <View style={styles.reasons} testID="verification-reasons">
          {chips.map((chip) => {
            const distance = reasonDistanceKey(chip.distance);
            return (
              <View
                key={chip.code}
                style={styles.reason}
                testID={`verification-reason-${chip.code}`}
              >
                <Chip icon="warning" label={chip.code} tone="review" />
                <Text style={styles.sentence}>
                  {t(chip.sentenceKey)}
                  {distance === null ? "" : ` ${t(distance.key, distance.values as never)}`}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {cells.length === 0 ? null : (
        <View style={styles.grid} testID="verification-metrics">
          {cells.map((cell) => (
            <View key={cell.key} style={styles.cell} testID={`verification-metric-${cell.key}`}>
              <Text style={styles.cellValue}>{cell.value}</Text>
              <Text style={styles.cellLabel}>{t(cell.labelKey)}</Text>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  reasons: { gap: spacing.sm, marginBottom: spacing.md },
  reason: { gap: spacing.xs },
  sentence: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.text },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  cell: { minWidth: 96, gap: 2 },
  cellValue: {
    fontFamily: fonts.bold,
    fontSize: fontSize.subtitle,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  cellLabel: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
});

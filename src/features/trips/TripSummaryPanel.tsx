/**
 * D6 presentation (M10, docs/12 D6).
 *
 * One panel, five stories, chosen by `variant` — verified, under review,
 * still checking, ended offline, not verified. Reasons come in as **codes**
 * (docs/08 §3) and are translated here, so a new reason code can never leak into
 * the UI as `END_OUTSIDE_DROP`, and the distance detail is only shown for the
 * two reasons the verifier actually measures.
 *
 * The totals line is the driver's official experience, straight from
 * `driver_stats`: the app never adds up kilometres itself (CLAUDE.md rule 1).
 */
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Button, Card, Chip, Icon, ListRow, StatBlock } from "@/components/ui";
import {
  formatCount,
  reasonDistanceM,
  reasonDistanceParts,
  reasonKey,
  type SummaryMetrics,
  type SummaryVariant,
} from "@/features/trips/summaryState";
import { colors, fonts, fontSize, radii, spacing } from "@/theme/tokens";

export type TripSummaryPanelProps = {
  variant: SummaryVariant;
  loadCode: string;
  /** "Sriperumbudur SIPCOT → Coimbatore Kurichi". */
  route: string;
  /** "26 Sep 2026", or null when the trip has no end time yet. */
  dateLabel: string | null;
  /** Official kilometres, or null while `verify_trip` has not run. */
  trackedKm: number | null;
  /** "9h 42m", or null when the trip is not finished. */
  durationLabel: string | null;
  /** Reason codes from `trips.verification_reasons`. */
  reasonCodes: string[];
  metrics: SummaryMetrics;
  /** `driver_stats` totals, or null for a driver with nothing verified yet. */
  totals: { verifiedTrips: number; verifiedKm: number } | null;
  onBack: () => void;
};

type VariantMeta = {
  titleKey: string;
  subtitleKey: string;
  icon: string;
  color: string;
  /** "Checking…" variants show a spinner instead of an icon. */
  spinner: boolean;
};

const VARIANTS: Record<SummaryVariant, VariantMeta> = {
  verified: {
    titleKey: "driver.summary.verifiedTitle",
    subtitleKey: "driver.summary.verifiedSubtitle",
    icon: "check_circle",
    color: colors.verified,
    spinner: false,
  },
  needs_review: {
    titleKey: "driver.summary.reviewTitle",
    subtitleKey: "driver.summary.reviewSubtitle",
    icon: "warning",
    color: colors.review,
    spinner: false,
  },
  verifying: {
    titleKey: "driver.summary.verifyingTitle",
    subtitleKey: "driver.summary.verifyingSubtitle",
    icon: "hourglass_top",
    color: colors.neutral,
    spinner: true,
  },
  pending_sync: {
    titleKey: "driver.summary.pendingTitle",
    subtitleKey: "driver.summary.pendingSubtitle",
    icon: "cloud_off",
    color: colors.review,
    spinner: true,
  },
  rejected: {
    titleKey: "driver.summary.rejectedTitle",
    subtitleKey: "driver.summary.rejectedSubtitle",
    icon: "cancel",
    color: colors.rejected,
    spinner: false,
  },
  cancelled: {
    titleKey: "driver.summary.cancelledTitle",
    subtitleKey: "driver.summary.cancelledSubtitle",
    icon: "block",
    color: colors.neutral,
    spinner: false,
  },
};

export function TripSummaryPanel({
  variant,
  loadCode,
  route,
  dateLabel,
  trackedKm,
  durationLabel,
  reasonCodes,
  metrics,
  totals,
  onBack,
}: TripSummaryPanelProps) {
  const { t } = useTranslation();
  const meta = VARIANTS[variant];

  return (
    <View style={styles.container} testID={`trip-summary-${variant}`}>
      <View style={styles.header}>
        {meta.spinner ? (
          <ActivityIndicator color={meta.color} size="large" testID="trip-summary-progress" />
        ) : (
          <Icon color={meta.color} name={meta.icon} size={56} />
        )}
        <Text style={styles.title}>{t(meta.titleKey)}</Text>
        <Text style={styles.subtitle}>{t(meta.subtitleKey)}</Text>
      </View>

      {reasonCodes.length > 0 ? (
        <Card style={styles.card} testID="trip-summary-reasons">
          <Text style={styles.cardTitle}>{t("driver.summary.reasonTitle")}</Text>
          {reasonCodes.map((code) => {
            const distance = reasonDistanceParts(reasonDistanceM(code, metrics));
            return (
              <ListRow
                icon="info"
                iconColor={meta.color}
                key={code}
                subtitle={
                  distance === null
                    ? undefined
                    : t(
                        distance.unit === "m"
                          ? "driver.summary.reasonDistanceM"
                          : "driver.summary.reasonDistance",
                        distance.unit === "m" ? { m: distance.amount } : { km: distance.amount },
                      )
                }
                testID={`trip-summary-reason-${code}`}
                title={t(reasonKey(code))}
              />
            );
          })}
        </Card>
      ) : null}

      <Card style={styles.card} testID="trip-summary-stats">
        <View style={styles.statsRow}>
          <StatBlock
            label={t(
              trackedKm === null
                ? "driver.summary.distancePending"
                : "driver.summary.distanceLabel",
            )}
            size="md"
            testID="trip-summary-distance"
            value={trackedKm === null ? "—" : `${formatCount(trackedKm)} km`}
          />
          <StatBlock
            label={t("driver.summary.durationLabel")}
            size="md"
            testID="trip-summary-duration"
            value={durationLabel ?? "—"}
          />
        </View>
      </Card>

      <Card style={styles.card} testID="trip-summary-route">
        <Chip icon="confirmation_number" label={loadCode} tone="accent" />
        <Text style={styles.route} numberOfLines={2}>
          {route}
        </Text>
        {dateLabel !== null ? <Text style={styles.date}>{dateLabel}</Text> : null}
      </Card>

      <Text style={styles.total} testID="trip-summary-total">
        {totals === null
          ? t("driver.summary.noTotal")
          : t("driver.summary.total", {
              trips: formatCount(totals.verifiedTrips),
              km: formatCount(totals.verifiedKm),
            })}
      </Text>

      <Button
        fullWidth
        label={t("driver.summary.back")}
        onPress={onBack}
        size="lg"
        testID="trip-summary-back"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  header: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.title, color: colors.text },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: fontSize.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
  card: { gap: spacing.sm, borderRadius: radii.card, padding: spacing.md },
  cardTitle: { fontFamily: fonts.semibold, fontSize: fontSize.body, color: colors.text },
  statsRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  route: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.text },
  date: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  total: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
});

/**
 * D8 verified experience card (M11, docs/12 D8).
 *
 * "A white card titled 'Verified experience' with a lock icon and caption
 * 'Calculated by Namma Lorry from GPS — can't be edited': 3 big stats '38
 * trips', '14,860 km', 'Last trip 26 Sep'."
 *
 * The caption and the lock are the point, not decoration. These numbers are
 * what a driver's work record *is* — they decide what Namma Lorry will pay for
 * a load — so the card says out loud that they are computed from GPS by
 * Namma Lorry and that nobody, including the driver, can type a different
 * number in. Everything shown comes from `driver_stats`; nothing is summed here
 * (CLAUDE.md rule 1).
 */
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { Card, Icon, SectionHeader, StatBlock } from "@/components/ui";
import { formatCount, formatTripDate } from "@/features/trips/summaryState";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

export type ProfileStatsCardProps = {
  /** Null for a driver who has not verified a trip yet — not zero. */
  verifiedTrips: number | null;
  verifiedKm: number | null;
  /** `driver_stats.last_verified_at`, ISO. */
  lastVerifiedAt: string | null;
};

export function ProfileStatsCard({
  verifiedTrips,
  verifiedKm,
  lastVerifiedAt,
}: ProfileStatsCardProps) {
  const { t } = useTranslation();
  const lastTrip = formatTripDate(lastVerifiedAt);

  return (
    <Card testID="profile-stats">
      <SectionHeader
        action={<Icon color={colors.neutral} name="lock" size={18} />}
        subtitle={t("driver.profile.statsCaption")}
        title={t("driver.profile.statsTitle")}
      />
      <View style={styles.stats}>
        <StatBlock
          label={t("driver.profile.trips")}
          testID="profile-stat-trips"
          value={verifiedTrips === null ? "—" : formatCount(verifiedTrips)}
        />
        <StatBlock
          label={t("driver.profile.km")}
          testID="profile-stat-km"
          value={
            verifiedKm === null ? "—" : t("driver.profile.kmValue", { km: formatCount(verifiedKm) })
          }
        />
        <StatBlock
          label={t("driver.profile.lastTrip")}
          testID="profile-stat-last"
          value={lastTrip ?? t("driver.profile.noTripsYet")}
        />
      </View>
      <Text style={styles.caption} testID="profile-stats-caption">
        {t("driver.profile.statsCaption")}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md, marginTop: spacing.sm },
  caption: {
    marginTop: spacing.md,
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
});

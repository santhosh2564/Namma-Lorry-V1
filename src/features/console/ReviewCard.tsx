/**
 * C7 review queue card (M11, docs/12 C7).
 *
 * One flagged trip: who, which load, where it was going, why it was flagged in
 * plain language, when it ended, and a thumbnail of the route so the queue can
 * be worked without opening every trip. The whole card opens C6, where the
 * decision is made.
 *
 * The map thumbnail is deliberately small and non-interactive: the queue's job
 * is triage, and a map that looks like it can be explored here would be a map
 * that cannot.
 */
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

import { AppMap } from "@/components/map";
import { Button, Card, Chip } from "@/components/ui";
import { ageParts } from "@/features/console/liveState";
import type { ReviewQueueRow } from "@/features/console/useConsoleTrip";
import { reasonChips, reasonDistanceKey } from "@/features/console/verificationState";
import { colors, fonts, fontSize, radii, spacing } from "@/theme/tokens";

export type ReviewCardProps = {
  row: ReviewQueueRow;
  nowMs: number;
  onOpen: (tripId: string) => void;
};

export function ReviewCard({ row, nowMs, onOpen }: ReviewCardProps) {
  const { t } = useTranslation();
  const age = ageParts(row.endedAt, nowMs);
  const chips = reasonChips(row.reasons, {
    points: null,
    mocked: null,
    jumps: null,
    maxGapS: null,
    avgKmh: null,
    plannedRatio: null,
    startDistanceM: null,
    endDistanceM: null,
  });

  return (
    <Card
      accentColor={colors.review}
      onPress={() => onOpen(row.id)}
      style={styles.card}
      testID={`review-card-${row.id}`}
    >
      <View style={styles.main}>
        <View style={styles.headerRow}>
          <Chip label={row.loadCode} tone="accent" />
          <Text style={styles.ended} testID="review-card-ended">
            {age === null
              ? t("console.review.endedUnknown")
              : t("console.review.endedAgo", {
                  value: t(`console.live.ago.${age.unit}`, { count: age.count }),
                })}
          </Text>
        </View>

        <Text style={styles.route}>
          {row.pickupAddress} → {row.dropAddress}
        </Text>
        <Text style={styles.who}>
          {t("console.review.driverAndVehicle", { driver: row.driverName, vehicle: row.vehicleNo })}
        </Text>

        <View style={styles.reasons} testID="review-card-reasons">
          {chips.map((chip) => {
            const distance = reasonDistanceKey(chip.distance);
            return (
              <Text key={chip.code} style={styles.reason}>
                {t(chip.sentenceKey)}
                {distance === null ? "" : ` ${t(distance.key, distance.values as never)}`}
              </Text>
            );
          })}
        </View>

        <Button
          fullWidth
          icon="rate_review"
          label={t("console.review.open")}
          onPress={() => onOpen(row.id)}
          size="sm"
          testID={`review-open-${row.id}`}
          variant="outline"
        />
      </View>

      <View pointerEvents="none" style={styles.thumb} testID={`review-card-map-${row.id}`}>
        <AppMap
          center={row.pickup}
          circles={[{ id: "drop", center: row.drop, radiusM: row.dropRadiusM }]}
          fitToContent
          markers={[
            { id: "pickup", position: row.pickup, kind: "pickup" },
            { id: "drop", position: row.drop, kind: "drop" },
          ]}
          polylines={[{ id: "planned", kind: "planned", path: [row.pickup, row.drop] }]}
          zoom={8}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", gap: spacing.md },
  main: { flex: 1, gap: spacing.xs },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  ended: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.textSecondary },
  route: { fontFamily: fonts.semibold, fontSize: fontSize.subtitle, color: colors.text },
  who: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  reasons: { gap: 2, marginVertical: spacing.xs },
  reason: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.review },
  thumb: { width: 200, height: 140, borderRadius: radii.md, overflow: "hidden" },
});

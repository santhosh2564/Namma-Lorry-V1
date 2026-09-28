/**
 * C1 side list (M11, docs/12 C1).
 *
 * "Active trips (6)" with a row each: vehicle, driver, load, route and how long
 * ago the truck last reported. The age is the point of the panel — docs/12 calls
 * out "18 min ago" in red with "No recent data" — so it is rendered as text and
 * colour together (never colour alone) and a stale row is pushed below the fresh
 * ones by `sortLiveTrips`.
 */
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Card, Chip, EmptyState, Icon } from "@/components/ui";
import {
  ageParts,
  isStale,
  kmPerHour,
  sortLiveTrips,
  type LiveTrip,
} from "@/features/console/liveState";
import { colors, fonts, fontSize, radii, spacing } from "@/theme/tokens";

export type LiveTripListProps = {
  trips: LiveTrip[];
  /** Stamped by the data layer, so a render never reads a clock. */
  nowMs: number;
  onSelect: (tripId: string) => void;
  selectedTripId: string | null;
};

export function LiveTripList({ trips, nowMs, onSelect, selectedTripId }: LiveTripListProps) {
  const { t } = useTranslation();
  const rows = sortLiveTrips(trips, nowMs);

  return (
    <Card style={styles.panel} testID="live-trip-list">
      <View style={styles.header}>
        <Text style={styles.title}>{t("console.live.activeTrips", { count: rows.length })}</Text>
        <Text style={styles.subtitle}>{t("console.live.subtitle")}</Text>
      </View>

      {rows.length === 0 ? (
        <EmptyState
          icon="local_shipping"
          message={t("console.live.emptyMessage")}
          testID="live-empty"
          title={t("console.live.emptyTitle")}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list} testID="live-trip-scroll">
          {rows.map((trip) => (
            <LiveTripRow
              key={trip.tripId}
              nowMs={nowMs}
              onPress={() => onSelect(trip.tripId)}
              selected={trip.tripId === selectedTripId}
              trip={trip}
            />
          ))}
        </ScrollView>
      )}
    </Card>
  );
}

type RowProps = {
  trip: LiveTrip;
  nowMs: number;
  selected: boolean;
  onPress: () => void;
};

function LiveTripRow({ trip, nowMs, selected, onPress }: RowProps) {
  const { t } = useTranslation();
  const stale = isStale(trip.recordedAt, nowMs);
  const age = ageParts(trip.recordedAt, nowMs);
  const speed = kmPerHour(trip.speedMps);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        stale ? styles.rowStale : null,
        selected ? styles.rowSelected : null,
        pressed ? styles.rowPressed : null,
      ]}
      testID={`live-trip-${trip.tripId}`}
    >
      <View style={styles.rowTop}>
        <Text style={styles.vehicle}>{trip.vehicleNo}</Text>
        <Chip label={trip.loadCode} tone="accent" />
      </View>
      <Text style={styles.driver}>{trip.driverName}</Text>
      <Text numberOfLines={1} style={styles.route}>
        {trip.pickupAddress} → {trip.dropAddress}
      </Text>
      <View style={styles.rowBottom}>
        <View style={[styles.dot, stale ? styles.dotStale : styles.dotLive]} />
        <Text style={[styles.age, stale ? styles.ageStale : null]} testID="live-age">
          {stale
            ? t("console.live.ageStale", {
                value: age === null ? "—" : t(`console.live.ago.${age.unit}`, { count: age.count }),
              })
            : t("console.live.age", {
                value: age === null ? "—" : t(`console.live.ago.${age.unit}`, { count: age.count }),
              })}
        </Text>
        {speed === null ? null : (
          <View style={styles.speedRow}>
            <Icon color={colors.textSecondary} name="speed" size={14} />
            <Text style={styles.speed} testID="live-speed">
              {speed} km/h
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, gap: spacing.sm, padding: spacing.md },
  header: { gap: 2 },
  title: { fontFamily: fonts.semibold, fontSize: fontSize.subtitle, color: colors.text },
  subtitle: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  list: { gap: spacing.sm },
  row: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceAlt,
  },
  rowStale: { borderLeftWidth: 4, borderLeftColor: colors.rejected },
  rowSelected: { backgroundColor: colors.liveMuted },
  rowPressed: { backgroundColor: colors.border },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  vehicle: { fontFamily: fonts.semibold, fontSize: fontSize.body, color: colors.text },
  driver: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.text },
  route: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotLive: { backgroundColor: colors.verified },
  dotStale: { backgroundColor: colors.rejected },
  age: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.textSecondary },
  ageStale: { color: colors.rejected },
  speedRow: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 2 },
  speed: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
  },
});

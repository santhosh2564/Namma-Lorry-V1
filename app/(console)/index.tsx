import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { AppMap } from "@/components/map";
import { Banner, Button, Card, EmptyState } from "@/components/ui";
import { LiveKpiStrip } from "@/features/console/LiveKpiStrip";
import { isStale, liveMapView } from "@/features/console/liveState";
import { LiveTripList } from "@/features/console/LiveTripList";
import { useLiveKpis, useLiveTrips, useLiveTripsRealtime } from "@/features/console/useLiveTrips";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

/**
 * C1 Live Dashboard (M11, docs/12 C1).
 *
 * "Content split: left 65% a large map with amber lorry markers rotated by
 * heading and navy route tails; one marker has a red ring (stale). Right 35%
 * panel 'Active trips (6)' … KPI strip above the map."
 *
 * Everything on this board comes from `trip_live` (one row per truck on the
 * road) and the counts Postgres can answer faster than the client should try.
 * The three staleness rules — the red row, the "no recent data" wording and the
 * 15-minute threshold — live in `liveState`, so the list, the map highlight and
 * the KPI strip cannot disagree with each other.
 *
 * The clock (`nowMs`) is read once per screen and refreshed with the data: a
 * component must not read a clock while rendering, and an age that only updates
 * when something else re-renders is not a live board.
 */
export default function LiveDashboardScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  // Bumping this is what makes the ages tick; the data layer stamps its own
  // read time, and this is the board's own "now".
  const [nowMs, setNowMs] = useState(() => Date.now());

  const live = useLiveTrips();
  useLiveTripsRealtime(live.isSuccess);

  // Re-read the ages on a timer rather than on every render of every truck.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const trips = live.data?.trips ?? [];
  // The data layer's stamp is the freshest known time; fall back to the board's.
  const clock = live.data?.readAt ?? nowMs;
  const kpis = useLiveKpis(clock);
  const view = liveMapView(trips);
  const staleCount = trips.filter((trip) => isStale(trip.recordedAt, clock)).length;

  const openTrip = (tripId: string) => {
    setSelectedTripId(tripId);
    router.push(`/(console)/trips/${tripId}` as never);
  };

  return (
    <View style={styles.screen} testID="live-dashboard-screen">
      <LiveKpiStrip kpis={kpis.kpis} />

      <View style={styles.columns}>
        <Card style={styles.mapCard} testID="live-map-card">
          {live.isPending ? (
            <View style={styles.mapLoading} testID="live-map-loading">
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : live.isError ? (
            <Banner
              actionLabel={t("common.retry")}
              message={t("console.live.loadFailed")}
              onAction={() => void live.refetch()}
              variant="error"
            />
          ) : trips.length === 0 ? (
            <EmptyState
              icon="map"
              message={t("console.live.emptyMessage")}
              testID="live-map-empty"
              title={t("console.live.emptyTitle")}
            />
          ) : (
            <AppMap
              center={view.center}
              fitToContent
              markers={view.markers}
              polylines={view.polylines}
              zoom={6}
            />
          )}
          {staleCount === 0 ? null : (
            <Text style={styles.staleNote} testID="live-stale-note">
              {t("console.live.staleNote", { count: staleCount })}
            </Text>
          )}
        </Card>

        <View style={styles.side}>
          <LiveTripList
            nowMs={clock}
            onSelect={openTrip}
            selectedTripId={selectedTripId}
            trips={trips}
          />
          {kpis.isError ? (
            <Button
              label={t("common.retry")}
              onPress={() => void live.refetch()}
              size="sm"
              variant="outline"
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: spacing.md, padding: spacing.lg },
  columns: { flex: 1, flexDirection: "row", gap: spacing.lg },
  mapCard: { flex: 1, padding: spacing.sm, gap: spacing.xs },
  mapLoading: { alignItems: "center", justifyContent: "center", flex: 1, minHeight: 240 },
  side: { width: 420, gap: spacing.sm },
  staleNote: {
    fontFamily: fonts.medium,
    fontSize: fontSize.caption,
    color: colors.rejected,
    textAlign: "center",
  },
});

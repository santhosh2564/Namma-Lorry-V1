import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppMap, type MapMarker, type MapPolyline } from "@/components/map";
import { Banner, Button, Card, Chip, SectionHeader, StatusChip } from "@/components/ui";
import { EventTimeline } from "@/features/console/EventTimeline";
import { ReplayBar } from "@/features/console/ReplayBar";
import {
  canReplay,
  indexAtTime,
  initialReplay,
  pauseReplay,
  playReplay,
  replayClock,
  replayDurationLabel,
  replayMarker,
  seekReplay,
  tickReplay,
} from "@/features/console/replayState";
import { ReviewPanel } from "@/features/console/ReviewPanel";
import {
  mergeRoutePoints,
  useAdminReviewTrip,
  useConsoleTrip,
  useTripEvents,
  useTripPointStream,
  useTripRoute,
  type RoutePoint,
} from "@/features/console/useConsoleTrip";
import { VerificationCard } from "@/features/console/VerificationCard";
import { readVerificationMetrics } from "@/features/console/verificationState";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";

/**
 * C6 Trip Detail & Review (M11, docs/12 C6, docs/08 §4).
 *
 * "Main left 65%: map with navy actual route, dashed grey planned route, green
 * start pin, red end flag; a replay timeline slider under the map with play
 * button and time labels. Right 35%: 'Verification' card listing reason chips
 * and a metrics grid; 'Timeline' card with events; and a sticky 'Review
 * decision' card with a required note textarea and two buttons."
 *
 * Four decisions this screen makes, and why:
 * - The **planned** route is the straight line between the geofence centres,
 *   dashed. The Mappls distance matrix returns a distance and a duration, not
 *   geometry (see C4): inventing a road line from two points would be a picture
 *   the database does not support.
 * - The **route** is the recorded `trip_points`, paged at 1000 rows, with the
 *   live tail appended by subscription while the trip is still running.
 * - The **replay** is index-based over those points (two seconds per point)
 *   rather than real time, because nobody watches nine hours at 1×.
 * - The **decision** is the `admin_review_trip` RPC with a mandatory note, and
 *   there is no optimistic update: the trip, the queue, the badge and the
 *   driver's totals all move in the database, and this screen re-reads them.
 */
export default function ConsoleTripDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const tripId = typeof params.id === "string" ? params.id : null;

  const [page, setPage] = useState(1);
  const [replay, setReplay] = useState(initialReplay);
  const [note, setNote] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const tripQuery = useConsoleTrip(tripId);
  const routeQuery = useTripRoute(tripId, page);
  const eventsQuery = useTripEvents(tripId);
  const decide = useAdminReviewTrip();

  const trip = tripQuery.data ?? null;
  const isLive = trip?.status === "in_progress";
  const livePoints = useTripPointStream(tripId, isLive);

  const points: RoutePoint[] = useMemo(
    () => mergeRoutePoints(routeQuery.data?.points ?? [], livePoints),
    [routeQuery.data?.points, livePoints],
  );

  // Playback is a 1 s tick over the pure machine in `replayState`.
  useEffect(() => {
    if (!replay.playing) {
      return;
    }
    const timer = setInterval(() => {
      setReplay((current) => tickReplay(current, points.length, Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, [replay.playing, points.length]);

  const cursor = replayMarker(points, replay);
  const cursorPoint = points[Math.min(replay.index, Math.max(0, points.length - 1))];

  const markers: MapMarker[] = useMemo(() => {
    const list: MapMarker[] = [];
    if (trip !== null) {
      list.push({ id: "pickup", position: trip.pickup, kind: "pickup" });
      list.push({ id: "drop", position: trip.drop, kind: "drop" });
    }
    if (cursor !== null) {
      list.push({ id: "cursor", position: cursor, kind: "truck" });
    }
    return list;
  }, [trip, cursor]);

  const polylines: MapPolyline[] = useMemo(() => {
    const list: MapPolyline[] = [];
    if (points.length > 1) {
      list.push({
        id: "actual",
        kind: "actual",
        path: points.map((point) => ({ lat: point.lat, lng: point.lng })),
      });
    }
    if (trip !== null) {
      // Dashed straight line — the shape C4 already established as honest.
      list.push({ id: "planned", kind: "planned", path: [trip.pickup, trip.drop] });
    }
    return list;
  }, [points, trip]);

  const circles = useMemo(() => {
    if (trip === null) {
      return [];
    }
    return [
      { id: "pickup", center: trip.pickup, radiusM: trip.pickupRadiusM },
      { id: "drop", center: trip.drop, radiusM: trip.dropRadiusM },
    ];
  }, [trip]);

  const onToggleReplay = useCallback(() => {
    setReplay((current) =>
      current.playing ? pauseReplay(current) : playReplay(current, points.length, Date.now()),
    );
  }, [points.length]);

  const onSeek = useCallback(
    (index: number) => {
      setReplay((current) => seekReplay(current, index, points.length, Date.now()));
    },
    [points.length],
  );

  // Tapping an event scrubs the replay to that moment.
  const onSeekToEvent = useCallback(
    (iso: string) => {
      onSeek(indexAtTime(points, iso));
    },
    [onSeek, points],
  );

  const onDecide = useCallback(
    async (approve: boolean) => {
      if (tripId === null) {
        return;
      }
      setErrorKey(null);
      try {
        await decide.mutateAsync({ tripId, approve, note });
        setNote("");
      } catch (error) {
        setErrorKey(error instanceof Error ? error.message : "console.review.failed");
      }
    },
    [decide, note, tripId],
  );

  if (tripQuery.isError) {
    return (
      <View style={styles.screen} testID="console-trip-screen">
        <Banner message={t("console.trip.loadFailed")} variant="error" />
      </View>
    );
  }

  if (tripQuery.isSuccess && trip === null) {
    return (
      <View style={styles.screen} testID="console-trip-screen">
        <Banner message={t("console.trip.notFound")} variant="warning" />
        <Button label={t("common.cancel")} onPress={() => router.back()} variant="outline" />
      </View>
    );
  }

  if (trip === null) {
    return <View style={styles.screen} testID="console-trip-screen" />;
  }

  const metrics = readVerificationMetrics(trip.metrics);
  const pageCount = routeQuery.data?.pageCount ?? 1;
  const showMore = page < pageCount;
  const durationLabel = replayDurationLabel(trip.startedAt, trip.endedAt);

  return (
    <View style={styles.screen} testID="console-trip-screen">
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Chip label={trip.loadCode} tone="accent" />
          <Text style={styles.route} testID="console-trip-route">
            {trip.pickupAddress} → {trip.dropAddress}
          </Text>
          <Text style={styles.who}>
            {t("console.trip.driverAndVehicle", {
              driver: trip.driverName,
              vehicle: trip.vehicleNo,
            })}
          </Text>
        </View>
        <View style={styles.headerSide}>
          <StatusChip audience="console" status={trip.status} />
          {durationLabel === null ? null : <Text style={styles.duration}>{durationLabel}</Text>}
        </View>
      </View>

      <View style={styles.columns}>
        <View style={styles.main}>
          <Card style={styles.mapCard} testID="console-trip-map">
            <AppMap
              circles={circles}
              fitToContent
              markers={markers}
              polylines={polylines}
              zoom={9}
            />
          </Card>

          <Card style={styles.replayCard}>
            <ReplayBar
              canReplay={canReplay(points.length)}
              clockLabel={replayClock(cursorPoint?.recordedAt ?? null)}
              onSeek={onSeek}
              onToggle={onToggleReplay}
              pointCount={points.length}
              state={replay}
              totalLabel={replayClock(trip.endedAt)}
            />
            {routeQuery.isError ? (
              <Banner
                actionLabel={t("common.retry")}
                message={t("console.trip.routeFailed")}
                onAction={() => void routeQuery.refetch()}
                variant="error"
              />
            ) : null}
            {showMore ? (
              <Button
                label={t("console.trip.loadMorePoints", { page: page + 1 })}
                onPress={() => setPage(page + 1)}
                size="sm"
                testID="console-trip-load-more"
                variant="outline"
              />
            ) : null}
          </Card>

          {isLive ? (
            <Banner
              message={t("console.trip.liveNote")}
              testID="console-trip-live-note"
              variant="info"
            />
          ) : null}
        </View>

        <ScrollView contentContainerStyle={styles.side} testID="console-trip-side">
          <VerificationCard
            metrics={metrics}
            pending={trip.status === "completed" || trip.status === "in_progress"}
            reasons={trip.reasons}
          />

          <EventTimeline events={eventsQuery.data ?? []} onSeekTo={onSeekToEvent} />

          <ReviewPanel
            canReview={trip.status === "needs_review"}
            errorKey={errorKey}
            note={note}
            onDecide={(approve) => void onDecide(approve)}
            onNoteChange={setNote}
            pending={decide.isPending}
            reviewedByName={trip.reviewedByName}
            reviewedNote={trip.reviewNote}
            verifiedKm={
              trip.trackedDistanceM === null ? null : Math.round(trip.trackedDistanceM / 1000)
            }
          />

          <Card>
            <SectionHeader title={t("console.trip.load")} />
            <Text style={styles.meta}>
              {t("console.trip.loadedPoints", { count: routeQuery.data?.total ?? points.length })}
            </Text>
            {trip.expectedPoints === null ? null : (
              <Text style={styles.meta}>
                {t("console.trip.expectedPoints", { count: trip.expectedPoints })}
              </Text>
            )}
            {trip.plannedDistanceM === null ? null : (
              <Text style={styles.meta}>
                {t("console.trip.plannedDistance", {
                  km: Math.round(trip.plannedDistanceM / 1000),
                })}
              </Text>
            )}
          </Card>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: spacing.md, padding: spacing.lg },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  headerMain: { flex: 1, gap: spacing.xs },
  headerSide: { alignItems: "flex-end", gap: spacing.xs },
  route: { fontFamily: fonts.semibold, fontSize: fontSize.title, color: colors.text },
  who: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  duration: { fontFamily: fonts.medium, fontSize: fontSize.caption, color: colors.textSecondary },
  columns: { flex: 1, flexDirection: "row", gap: spacing.lg },
  main: { flex: 1, gap: spacing.md },
  mapCard: { flex: 1, padding: spacing.sm, minHeight: 320 },
  replayCard: { gap: spacing.sm },
  side: { width: 420, gap: spacing.md, paddingBottom: spacing.lg },
  meta: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
});

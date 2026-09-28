import * as Location from "expo-location";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppMap } from "@/components/map";
import type { MapCircle, MapMarker, MapPolyline } from "@/components/map/types";
import { Banner, Button, Card, Chip, Icon } from "@/components/ui";
import { readPermissionSnapshot, type PermissionSnapshot } from "@/features/onboarding/permissions";
import {
  distanceToPickupM,
  startEnabled,
  startState,
  type StartState,
} from "@/features/trips/startState";
import { useDriverTrip } from "@/features/trips/useDriverTrips";
import { colors, fonts, fontSize, spacing } from "@/theme/tokens";
import { startTrip } from "@/tracking/service";

/**
 * D4 Trip Detail & Start (docs/12 D4).
 *
 * The map carries the pickup geofence, the drop pin, the straight dashed
 * "planned route" line (labelled as such — the real polyline belongs to M11's
 * live map) and the driver's own dot. The bottom sheet derives its state from
 * the pure `startState` module: waiting for GPS, weak GPS, outside radius
 * (with the distance), ready, starting, or an RPC error to retry.
 *
 * START calls `tracking.startTrip`, which is the M8 engine's guarded flow: a
 * rejected start (wrong radius, poor accuracy, another trip live) never starts
 * the location task, and the driver gets the server's reason, not a spinner.
 */
export default function TripDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalTripId();
  const tripQuery = useDriverTrip(id);

  const [permissions, setPermissions] = useState<PermissionSnapshot | null>(null);
  const [fix, setFix] = useState<{ lat: number; lng: number; accuracyM: number | null } | null>(
    null,
  );
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPermissions = useCallback(() => {
    void readPermissionSnapshot().then(setPermissions);
  }, []);

  useEffect(() => {
    refreshPermissions();
  }, [refreshPermissions]);

  // Watch the fix while the screen is open (docs/12 D4's live "distance to
  // pickup"). Foreground watch: the trip task owns the background stream.
  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;
    void (async () => {
      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 5_000,
            distanceInterval: 10,
          },
          (position) => {
            if (cancelled) {
              return;
            }
            const { latitude, longitude, accuracy } = position.coords;
            setFix({
              lat: latitude,
              lng: longitude,
              accuracyM:
                typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
            });
          },
        );
      } catch {
        // No fix yet; the state machine shows "waiting for GPS".
      }
    })();
    return () => {
      cancelled = true;
      void subscription?.remove();
    };
  }, []);

  const trip = tripQuery.data ?? null;

  const pickup = useMemo(
    () =>
      trip === null
        ? null
        : { lat: trip.pickupLat, lng: trip.pickupLng, radiusM: trip.pickupRadiusM },
    [trip],
  );

  const permissionsOk =
    permissions?.foreground === "granted" && permissions?.background === "granted";

  const state: StartState = useMemo(() => {
    if (pickup === null) {
      return "no_fix";
    }
    return startState({ fix, permissionsOk, pickup, starting, error });
  }, [fix, permissionsOk, pickup, starting, error]);

  const distance = pickup === null ? null : distanceToPickupM(fix, pickup);

  const startTapped = useCallback(async () => {
    if (trip === null || id === null) {
      return;
    }
    setStarting(true);
    setError(null);
    try {
      const result = await startTrip(trip.id);
      if (result.kind === "started") {
        router.replace({ pathname: "/(driver)/trips/[id]/live", params: { id: trip.id } });
        return;
      }
      if (result.kind === "already_tracking") {
        router.replace({ pathname: "/(driver)/trips/[id]/live", params: { id: trip.id } });
        return;
      }
      setError(result.error.message);
    } catch (thrown) {
      setError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      setStarting(false);
    }
  }, [id, router, trip]);

  if (tripQuery.isLoading || trip === null || pickup === null) {
    return (
      <SafeAreaView style={styles.safe} testID="driver-trip-loading">
        <ActivityIndicator color={colors.accent} style={styles.centerSpinner} />
      </SafeAreaView>
    );
  }

  const markers: MapMarker[] = [
    { id: "pickup", position: { lat: pickup.lat, lng: pickup.lng }, kind: "pickup" },
    { id: "drop", position: { lat: trip.dropLat, lng: trip.dropLng }, kind: "drop" },
  ];
  if (fix !== null) {
    markers.push({ id: "driver", position: { lat: fix.lat, lng: fix.lng }, kind: "truck" });
  }
  const circles: MapCircle[] = [
    {
      id: "pickup-geofence",
      center: { lat: pickup.lat, lng: pickup.lng },
      radiusM: pickup.radiusM,
    },
  ];
  const planned: MapPolyline[] = [
    {
      id: "planned",
      kind: "planned",
      // A straight line between the two geofence centres, rendered dashed and
      // labelled "planned" — the road polyline belongs to M11's live map.
      path: [
        { lat: pickup.lat, lng: pickup.lng },
        { lat: trip.dropLat, lng: trip.dropLng },
      ],
    },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]} testID="driver-trip-detail-screen">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.mapArea}>
        <AppMap circles={circles} fitToContent markers={markers} polylines={planned} />
        {fix !== null ? (
          <View style={styles.gpsChip}>
            <Chip
              icon="my_location"
              label={t("driver.trip.gpsAccuracy", { metres: Math.round(fix.accuracyM ?? 0) })}
              tone={state === "gps_weak" ? "review" : "primary"}
            />
          </View>
        ) : null}
      </View>

      <Card style={styles.sheet} testID="driver-trip-sheet">
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <Chip icon="confirmation_number" label={trip.loadCode} tone="accent" />
          <Text style={styles.route} numberOfLines={2}>
            {trip.pickup} → {trip.drop}
          </Text>
          <View style={styles.metaRow}>
            {trip.material !== null ? <MetaRow icon="inventory_2" text={trip.material} /> : null}
            <MetaRow icon="local_shipping" text={trip.vehicleNo} />
            {trip.plannedDistanceM !== null ? (
              <MetaRow
                icon="route"
                text={t("driver.trip.planned", { km: Math.round(trip.plannedDistanceM / 1000) })}
              />
            ) : null}
          </View>

          <StartStateRow distance={distance} fix={fix} state={state} />

          {error !== null ? (
            <Banner
              message={error}
              onDismiss={() => setError(null)}
              testID="driver-trip-start-error"
              variant="error"
            />
          ) : null}

          <Button
            disabled={!startEnabled(state)}
            fullWidth
            icon="play_arrow"
            label={t("driver.trip.start")}
            loading={state === "starting"}
            onPress={() => void startTapped()}
            size="driver"
            testID="driver-trip-start"
            variant="success"
          />
          <Text style={styles.sheetHint}>{t("driver.trip.startHint")}</Text>
        </ScrollView>
      </Card>
    </SafeAreaView>
  );
}

function MetaRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.metaItem}>
      <Icon name={icon} size={14} color={colors.textSecondary} />
      <Text style={styles.metaText}>{text}</Text>
    </View>
  );
}

/** The status row that changes with the start state (docs/12 D4's states). */
function StartStateRow({
  state,
  fix,
  distance,
}: {
  state: StartState;
  fix: { lat: number; lng: number; accuracyM: number | null } | null;
  distance: number | null;
}) {
  const { t } = useTranslation();
  switch (state) {
    case "starting":
      return (
        <View style={styles.stateRow} testID="driver-trip-state-starting">
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.stateText}>{t("driver.trip.state.starting")}</Text>
        </View>
      );
    case "gps_weak":
      return (
        <View style={styles.stateRow} testID="driver-trip-state-gps-weak">
          <Icon color={colors.review} name="gps_off" size={18} />
          <Text style={styles.stateText}>
            {t("driver.trip.state.gpsWeak", { metres: Math.round(fix?.accuracyM ?? 0) })}
          </Text>
        </View>
      );
    case "outside_radius":
      return (
        <View style={styles.stateRow} testID="driver-trip-state-outside">
          <Icon color={colors.review} name="near_me" size={18} />
          <Text style={styles.stateText}>
            {t("driver.trip.state.outside", {
              km: ((distance ?? 0) / 1000).toFixed(1),
            })}
          </Text>
        </View>
      );
    case "ready":
      return (
        <View style={styles.stateRow} testID="driver-trip-state-ready">
          <Icon color={colors.verified} name="check_circle" size={18} />
          <Text style={styles.stateText}>
            {t("driver.trip.state.ready", { metres: Math.round(fix?.accuracyM ?? 0) })}
          </Text>
        </View>
      );
    case "error":
      return null; // the Banner above carries it
    case "no_fix":
    default:
      return (
        <View style={styles.stateRow} testID="driver-trip-state-waiting">
          <ActivityIndicator size="small" color={colors.textSecondary} />
          <Text style={styles.stateText}>{t("driver.trip.state.waiting")}</Text>
        </View>
      );
  }
}

/** `useLocalSearchParams` typed once, so the screen body stays readable. */
function useLocalTripId(): { id: string | null } {
  const params = useLocalSearchParams<{ id: string }>();
  const raw = params.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return { id: id ?? null };
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  mapArea: { flex: 1 },
  gpsChip: { position: "absolute", top: spacing.md, alignSelf: "center" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: "45%",
  },
  sheetContent: { gap: spacing.md, padding: spacing.lg },
  route: { fontFamily: fonts.semibold, fontSize: fontSize.body, color: colors.text },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  metaItem: { flexDirection: "row", alignItems: "center", gap: spacing.xxs },
  metaText: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  stateRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stateText: { fontFamily: fonts.medium, fontSize: fontSize.body, color: colors.text },
  sheetHint: {
    fontFamily: fonts.regular,
    fontSize: fontSize.caption,
    color: colors.textSecondary,
    textAlign: "center",
  },
  centerSpinner: { flex: 1 },
});

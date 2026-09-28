import { useNetInfo } from "@react-native-community/netinfo";
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, AppState, BackHandler, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppMap } from "@/components/map";
import type { MapMarker, MapPolyline } from "@/components/map/types";
import { Banner, ConfirmSheet } from "@/components/ui";
import { useAuthStore } from "@/features/auth/store";
import {
  isPermissionFlowSupported,
  readPermissionSnapshot,
} from "@/features/onboarding/permissions";
import { useSettingsStore } from "@/features/settings/store";
import { useTripKeepAwake } from "@/features/trips/keepAwake";
import {
  agoParts,
  liveGpsState,
  liveStats,
  liveSyncState,
  trackingProblem,
} from "@/features/trips/liveState";
import { LiveTripHeader, LiveTripSheet } from "@/features/trips/LiveTripSheet";
import { useDriverTrip } from "@/features/trips/useDriverTrips";
import { useLiveTripData } from "@/features/trips/useLiveTripData";
import { colors, spacing } from "@/theme/tokens";
import { endTrip } from "@/tracking/service";

/**
 * D5 Active Trip (docs/12 D5).
 *
 * The screen follows the truck on the map and draws the route **from the local
 * queue**, so it keeps working with no signal — which is exactly when the driver
 * looks at it. Everything shown is derived by the pure `liveState` module:
 * elapsed time, approximate kilometres, kilometres to the drop, the sync story,
 * GPS quality and the two things that need a banner (no point for over two
 * minutes, or a revoked permission).
 *
 * Two rules this screen is built around:
 * - **Leaving does not stop tracking.** Tracking lives in the background task
 *   the trip started; nothing here tears it down on unmount, and Android's back
 *   button is handled explicitly so it returns to My Trips instead of exiting
 *   the app.
 * - **Ending is never blocked** (docs/08 §3). The confirmation sheet warns when
 *   the driver is still outside the drop radius, but the driver can always end —
 *   the verifier flags `END_OUTSIDE_DROP` rather than stranding the phone
 *   recording.
 */
export default function ActiveTripScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalTripId();

  const tripQuery = useDriverTrip(id);
  const live = useLiveTripData(id);
  const netInfo = useNetInfo();
  const keepAwakeEnabled = useSettingsStore((state) => state.keepAwakeEnabled);
  const toggleKeepAwake = useSettingsStore((state) => state.toggleKeepAwake);
  const setActiveTrip = useAuthStore((state) => state.setActiveTrip);

  // Web has no permission dialogs to read, so a browser must never be told its
  // location permission is off — it cannot be, and the note belongs to D1
  // (docs/12: trips run on the phone).
  const permissionFlowSupported = isPermissionFlowSupported();
  const [permissionsOk, setPermissionsOk] = useState<boolean | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  // The setting is the driver's; the wake lock follows it (off by default).
  useTripKeepAwake(keepAwakeEnabled);

  // Permissions are re-read whenever the driver comes back to the screen: a
  // revoked grant is the most common reason tracking quietly stops.
  const refreshPermissions = useCallback(() => {
    if (!permissionFlowSupported) {
      return;
    }
    void readPermissionSnapshot().then((snapshot) =>
      setPermissionsOk(snapshot.foreground === "granted" && snapshot.background === "granted"),
    );
  }, [permissionFlowSupported]);

  useEffect(() => {
    refreshPermissions();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refreshPermissions();
      }
    });
    return () => subscription.remove();
  }, [refreshPermissions]);

  // Android back leaves the screen; the trip keeps recording.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      router.replace("/(driver)");
      return true;
    });
    return () => subscription.remove();
  }, [router]);

  const data = live.data;
  const points = useMemo(() => data?.points ?? [], [data]);
  const trip = tripQuery.data ?? null;

  const drop = useMemo(
    () => (trip === null ? null : { lat: trip.dropLat, lng: trip.dropLng }),
    [trip],
  );

  // The polling read stamps its own time (`readAt`), so elapsed time and the
  // staleness rule advance on every tick without a second timer — and without
  // reading a clock during render (the queue reader does that instead).
  const now = data?.readAt ?? 0;

  const stats = useMemo(
    () =>
      liveStats({
        points,
        startedAt: data?.startedAt ?? trip?.startedAt ?? null,
        drop,
        dropRadiusM: trip?.dropRadiusM ?? 0,
        now,
      }),
    [points, data?.startedAt, trip?.startedAt, trip?.dropRadiusM, drop, now],
  );

  const sync = liveSyncState({
    offline: netInfo.isConnected === false,
    pendingPoints: data?.pendingPoints ?? 0,
  });
  const gps = liveGpsState(stats.last);
  const problem = trackingProblem({
    lastPointAt: stats.last?.recordedAt ?? null,
    startedAt: data?.startedAt ?? null,
    now,
    // `null` means "not read yet" — only a confirmed revoke raises the banner,
    // and on web the question does not apply.
    permissionsOk: !permissionFlowSupported || permissionsOk !== false,
  });
  const syncedAgo = data?.syncedAt ? agoParts(data.syncedAt, now) : null;

  const markers: MapMarker[] = [];
  if (trip !== null) {
    markers.push({ id: "drop", kind: "drop", position: { lat: trip.dropLat, lng: trip.dropLng } });
  }
  if (stats.last !== null) {
    markers.push({ id: "truck", kind: "truck", position: stats.last });
  }
  const polylines: MapPolyline[] =
    points.length > 1
      ? [
          {
            id: "actual",
            kind: "actual",
            path: points.map((point) => ({ lat: point.lat, lng: point.lng })),
          },
        ]
      : [];

  const endTapped = useCallback(async () => {
    if (id === null) {
      return;
    }
    setEnding(true);
    setEndError(null);
    try {
      const result = await endTrip();
      // Both "ended" and the offline "pending" land on D6: the summary is where
      // the driver learns whether the trip is verified or waiting to sync.
      if (result.kind === "ended" || result.kind === "pending") {
        setActiveTrip(result.kind === "pending" ? id : null);
        router.replace({ pathname: "/(driver)/trips/[id]/summary", params: { id } });
        return;
      }
      setEndError(result.error.message);
    } catch (thrown) {
      setEndError(thrown instanceof Error ? thrown.message : String(thrown));
    } finally {
      // Always close the sheet: on success we are leaving the screen, and on
      // failure the error banner lives in the panel behind it — a modal that
      // hides its own error would read as "nothing happened".
      setEnding(false);
      setConfirmVisible(false);
    }
  }, [id, router, setActiveTrip]);

  const outsideDropWarning =
    stats.last !== null && drop !== null && !stats.nearDrop && stats.kmToDrop !== null;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]} testID="driver-live-screen">
      <View style={styles.mapArea}>
        <AppMap
          center={stats.last ?? drop ?? undefined}
          markers={markers}
          polylines={polylines}
          zoom={15}
        />
        <View style={styles.header}>
          <LiveTripHeader
            destination={trip?.drop ?? "—"}
            keepAwakeEnabled={keepAwakeEnabled}
            loadCode={trip?.loadCode ?? "—"}
            onToggleKeepAwake={toggleKeepAwake}
          />
        </View>
        {live.isLoading && points.length === 0 ? (
          <ActivityIndicator
            color={colors.accent}
            style={styles.mapSpinner}
            testID="driver-live-loading"
          />
        ) : null}
        {tripQuery.isError ? (
          <View style={styles.mapError}>
            <Banner
              actionLabel={t("common.retry")}
              message={t("driver.live.loadFailed")}
              onAction={() => void tripQuery.refetch()}
              testID="driver-live-load-error"
              variant="error"
            />
          </View>
        ) : null}
      </View>

      <LiveTripSheet
        approxKm={stats.approxKm}
        elapsed={stats.elapsed}
        endError={endError}
        ending={ending}
        gps={gps}
        gpsAccuracyM={stats.last?.accuracyM ?? null}
        kmToDrop={stats.kmToDrop}
        nearDrop={stats.nearDrop}
        onEnd={() => setConfirmVisible(true)}
        onOpenSettings={() => void Linking.openSettings().catch(() => undefined)}
        pendingPoints={data?.pendingPoints ?? 0}
        problem={problem}
        sync={sync}
        syncedAgo={syncedAgo}
      />

      <ConfirmSheet
        cancelLabel={t("driver.live.endCancel")}
        confirmLabel={t("driver.live.endConfirm")}
        destructive
        loading={ending}
        message={t("driver.live.endSheetBody")}
        onCancel={() => setConfirmVisible(false)}
        onConfirm={() => void endTapped()}
        testID="driver-live-end-sheet"
        title={t("driver.live.endSheetTitle")}
        visible={confirmVisible}
      >
        {outsideDropWarning ? (
          <Banner
            message={t("driver.live.endOutsideWarning", { km: (stats.kmToDrop ?? 0).toFixed(0) })}
            testID="driver-live-end-outside"
            variant="warning"
          />
        ) : null}
      </ConfirmSheet>
    </SafeAreaView>
  );
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
  header: { position: "absolute", top: spacing.md, left: spacing.md, right: spacing.md },
  mapSpinner: { position: "absolute", top: "45%", alignSelf: "center" },
  mapError: { position: "absolute", bottom: spacing.md, left: spacing.md, right: spacing.md },
});

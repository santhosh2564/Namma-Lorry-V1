import { MaterialIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MapView } from '@/components/map/MapView';
import { Banner, Button, Chip, ErrorBanner, Text } from '@/components/ui';
import { localTripQueryKey } from '@/features/auth/useRoutingDecision';
import { formatDistanceKm } from '@/features/loads/status';
import { cargoText, driverTripKeys, useMyTrip } from '@/features/trips/api';
import {
  canStart,
  formatShortDistance,
  startState,
  type Fix,
  type StartState,
} from '@/features/trips/startState';
import { t, useLanguage } from '@/i18n';
import { useNow } from '@/lib/useNow';
import { TripError, tripErrorText } from '@/tracking/errors';
import { watchForegroundFix } from '@/tracking/foregroundLocation';
import { checkTrackingPermissions, permissionsQueryKey } from '@/tracking/permissions';
import { getTracking } from '@/tracking/runtime';
import { colors, radius, sizes, space } from '@/theme/tokens';
import { tripDetailMapHeight } from '@/features/trips/layout';

const s = t.tripDetail;

/** D4 Trip Detail & Start (docs/12 D4, docs/06 §1 start flow). */
export default function TripDetail() {
  useLanguage(); // re-render on language change (M12a)
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const qc = useQueryClient();
  const trip = useMyTrip(id);
  const permissions = useQuery({ queryKey: permissionsQueryKey, queryFn: checkTrackingPermissions });
  const permissionsOk = permissions.data?.ok ?? false;
  // While the check is loading, show "waiting for GPS" rather than a permission error.
  const permissionsShownOk = permissions.isPending || permissionsOk;
  const [fix, setFix] = useState<Fix | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outsideM, setOutsideM] = useState<number | null>(null);
  const now = useNow(5_000);

  // Foreground GPS only while this screen is open, and only once location is allowed.
  useEffect(() => {
    if (!permissionsOk) return;
    return watchForegroundFix(setFix, () => setFix(null));
  }, [permissionsOk]);

  const load = trip.data?.load ?? null;
  const tripId = trip.data?.id;

  if (trip.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!trip.data || !load || !tripId) {
    return (
      <SafeAreaView style={[styles.flex, styles.pad]}>
        {trip.isError ? (
          <ErrorBanner error={trip.error} onRetry={() => void trip.refetch()} testID="d4-error" />
        ) : (
          <Banner tone="error" message={s.notFound} />
        )}
        <Button label={t.common.back} variant="outline" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const pickup = { lat: load.pickup_lat, lng: load.pickup_lng };
  const drop = { lat: load.drop_lat, lng: load.drop_lng };
  const state = startState({
    tripStatus: trip.data.status,
    pickup,
    pickupRadiusM: load.pickup_radius_m,
    fix,
    permissionsOk: permissionsShownOk,
    starting,
    now,
  });

  async function onStart() {
    setStarting(true);
    setError(null);
    try {
      const { engine } = await getTracking();
      await engine.startTrip(tripId!);
      await goLive();
    } catch (e) {
      const err = e instanceof TripError ? e : new TripError('UNKNOWN', undefined, String(e));
      if (err.code === 'TRACKING_START_FAILED') {
        // Started on the server and saved locally; D5 shows the tracking problem and retries.
        await goLive();
      } else if (err.code === 'OUTSIDE_PICKUP') {
        setOutsideM(err.distanceM ?? 0);
      } else {
        setError(tripErrorText(err));
        if (err.code === 'TRIP_NOT_STARTABLE' || err.code === 'TRIP_NOT_FOUND') void trip.refetch();
      }
    } finally {
      setStarting(false);
    }
  }

  async function goLive() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: localTripQueryKey }),
      qc.invalidateQueries({ queryKey: driverTripKeys.detail(tripId!) }),
      qc.invalidateQueries({ queryKey: ['driver', 'trips'] }),
    ]);
    router.replace(`/driver/trips/${tripId}/live`);
  }

  return (
    <View style={styles.flex}>
      <MapView
        testID="d4-map"
        height={tripDetailMapHeight(fontScale)}
        fitToContent
        markers={[
          { id: 'pickup', kind: 'pickup', position: pickup },
          { id: 'drop', kind: 'drop', position: drop },
          ...(fix ? [{ id: 'me', kind: 'me' as const, position: { lat: fix.lat, lng: fix.lng } }] : []),
        ]}
        circles={[{ id: 'pickup-radius', center: pickup, radiusM: load.pickup_radius_m }]}
        // Drivers can't call the admin-only route proxy and loads store no road geometry,
        // so the planned route is the straight pickup → drop line (ND-31).
        polylines={[{ id: 'planned', kind: 'planned', path: [pickup, drop] }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.common.back}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/driver'))}
        style={styles.backButton}
        hitSlop={8}
      >
        <MaterialIcons name="arrow-back" size={24} color={colors.primary} />
      </Pressable>

      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.sheetContent}>
          <Chip label={load.load_code} tone="accent" />
          <View style={styles.route}>
            <MaterialIcons name="place" size={20} color={colors.verified} />
            <Text variant="bodyStrong" style={styles.flex}>
              {load.pickup_address}
            </Text>
          </View>
          <View style={styles.route}>
            <MaterialIcons name="flag" size={20} color={colors.danger} />
            <Text variant="bodyStrong" style={styles.flex}>
              {load.drop_address}
            </Text>
          </View>
          <InfoRow icon="inventory-2" label={s.material} value={cargoText(load)} />
          <InfoRow
            icon="local-shipping"
            label={s.vehicle}
            value={
              trip.data.vehicle
                ? `${trip.data.vehicle.registration_no} · ${trip.data.vehicle.vehicle_type}`
                : '—'
            }
          />
          <InfoRow icon="route" label={s.planned} value={formatDistanceKm(load.planned_distance_m)} />

          <StatusRow state={state} />
          {error ? <Banner tone="error" message={error} testID="d4-error" /> : null}

          {state.kind === 'in-progress' ? (
            <Button
              label={t.trips.resume}
              size="driver"
              icon="play-arrow"
              onPress={() => router.replace(`/driver/trips/${tripId}/live`)}
              testID="d4-resume"
            />
          ) : state.kind === 'permission' ? (
            <Button
              label={s.fixPermissions}
              onPress={() => router.push('/permissions')}
              testID="d4-fix-permissions"
            />
          ) : state.kind === 'not-startable' ? null : (
            <>
              <Button
                label={state.kind === 'starting' ? s.starting : s.start}
                variant="success"
                size="driver"
                icon="play-arrow"
                disabled={!canStart(state)}
                loading={state.kind === 'starting'}
                onPress={() => void onStart()}
                testID="d4-start"
              />
              <Text variant="caption" tone="secondary" align="center">
                {s.caption}
              </Text>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <OutsideSheet distanceM={outsideM} onClose={() => setOutsideM(null)} />
    </View>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={styles.infoRow}>
      <MaterialIcons name={icon} size={18} color={colors.textSecondary} />
      <Text tone="secondary" style={styles.infoLabel}>
        {label}
      </Text>
      <Text variant="bodyStrong" style={styles.flex}>
        {value}
      </Text>
    </View>
  );
}

const STATUS_STYLE = {
  ok: { bg: colors.verifiedSoft, fg: colors.verifiedText, icon: 'check-circle' },
  warn: { bg: colors.accentSoft, fg: colors.reviewText, icon: 'info-outline' },
  error: { bg: colors.dangerSoft, fg: colors.dangerText, icon: 'location-off' },
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary, icon: 'info-outline' },
} as const;

function statusCopy(
  state: StartState,
): { tone: keyof typeof STATUS_STYLE; text: string; spinner?: boolean } | null {
  switch (state.kind) {
    case 'waiting-gps':
      return { tone: 'neutral', text: s.waitingGps, spinner: true };
    case 'starting':
      return { tone: 'neutral', text: s.starting, spinner: true };
    case 'weak-gps':
      return { tone: 'warn', text: s.weakGps(state.accuracyM) };
    case 'outside':
      return { tone: 'warn', text: s.outside(formatShortDistance(state.distanceM)) };
    case 'ready':
      return { tone: 'ok', text: s.ready(state.accuracyM) };
    case 'permission':
      return { tone: 'error', text: s.permissionMissing };
    case 'not-startable':
      return { tone: 'neutral', text: s.notStartable };
    case 'in-progress':
      return null;
  }
}

function StatusRow({ state }: { state: StartState }) {
  const copy = statusCopy(state);
  if (!copy) return null;
  const st = STATUS_STYLE[copy.tone];
  return (
    <View
      style={[styles.status, { backgroundColor: st.bg }]}
      testID="d4-status"
      accessibilityLiveRegion="polite"
      accessibilityLabel={copy.text}
    >
      {copy.spinner ? (
        <ActivityIndicator color={st.fg} />
      ) : (
        <MaterialIcons name={st.icon} size={20} color={st.fg} />
      )}
      <Text variant="bodyStrong" style={[styles.flex, { color: st.fg }]} testID={`d4-status-${state.kind}`}>
        {copy.text}
      </Text>
    </View>
  );
}

/** "Outside pickup" sheet (docs/12 overlays): the server refused the start fix. */
function OutsideSheet({ distanceM, onClose }: { distanceM: number | null; onClose: () => void }) {
  return (
    <Modal visible={distanceM !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={s.outsideSheetOk} />
      <SafeAreaView edges={['bottom']} style={styles.modalSheet} testID="d4-outside-sheet">
        <MaterialIcons name="wrong-location" size={40} color={colors.review} />
        <Text variant="title">{s.outsideSheetTitle}</Text>
        <Text>{s.outside(formatShortDistance(distanceM ?? 0))}</Text>
        <Button label={s.outsideSheetOk} onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pad: { padding: space.lg, gap: space.md, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  backButton: {
    position: 'absolute',
    top: space.xl,
    left: space.md,
    width: sizes.touchMin,
    height: sizes.touchMin,
    borderRadius: sizes.touchMin / 2,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    flex: 1,
    marginTop: -space.lg,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card + 8,
    borderTopRightRadius: radius.card + 8,
  },
  sheetContent: {
    padding: space.lg,
    gap: space.md,
    width: '100%',
    maxWidth: sizes.maxContentWidth,
    alignSelf: 'center',
  },
  route: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  infoRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  infoLabel: { minWidth: 76, maxWidth: '40%' },
  status: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.input,
  },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  modalSheet: {
    backgroundColor: colors.surface,
    padding: space.lg,
    gap: space.md,
    borderTopLeftRadius: radius.card + 8,
    borderTopRightRadius: radius.card + 8,
  },
});

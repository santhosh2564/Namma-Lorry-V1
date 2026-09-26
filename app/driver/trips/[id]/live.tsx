import { MaterialIcons } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MapView } from '@/components/map/MapView';
import { Banner, Button, Chip, Text } from '@/components/ui';
import { localTripQueryKey } from '@/features/auth/useRoutingDecision';
import { formatDuration } from '@/features/loads/status';
import { isLocationReady } from '@/features/onboarding/permissionModel';
import { driverTripKeys, shortPlace, useMyTrip } from '@/features/trips/api';
import { getKeepAwake, setKeepAwake } from '@/features/trips/keepAwakePref';
import {
  approxDistanceM,
  currentPosition,
  dropInfo,
  gpsStatus,
  isTrackingProblem,
  syncStatus,
  type GpsStatus,
  type SyncStatus,
  type TrackPoint,
} from '@/features/trips/liveModel';
import { formatShortDistance } from '@/features/trips/startState';
import { t } from '@/i18n/en';
import { useNow } from '@/lib/useNow';
import { TripError } from '@/tracking/errors';
import { watchForegroundFix } from '@/tracking/foregroundLocation';
import { getLiveSnapshot, liveTripKey, restartTracking } from '@/tracking/liveTrip';
import { openLocationServicesSettings, permissionsQueryKey, readPermissions } from '@/tracking/permissions';
import { getTracking } from '@/tracking/runtime';
import { colors, radius, space } from '@/theme/tokens';

const s = t.activeTrip;
const KEEP_AWAKE_TAG = 'namma-lorry-active-trip';

/**
 * D5 Active Trip (docs/12 D5). Everything shown comes from this phone's queue, so it works
 * offline. Leaving the screen (back button, app switch) never stops tracking: only End does.
 */
export default function ActiveTrip() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { height } = useWindowDimensions();
  const trip = useMyTrip(id);
  const live = useQuery({
    queryKey: liveTripKey(id),
    queryFn: () => getLiveSnapshot(id),
    refetchInterval: 5_000,
    networkMode: 'always',
  });
  const perms = useQuery({
    queryKey: [...permissionsQueryKey, 'snapshot'],
    queryFn: readPermissions,
    refetchInterval: 15_000,
    networkMode: 'always',
  });
  const net = useNetInfo();
  const online = !(net.isConnected === false || net.isInternetReachable === false);
  const now = useNow(5_000);
  const [fix, setFix] = useState<TrackPoint | null>(null);
  const [sheet, setSheet] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keepAwake = useQuery({
    queryKey: ['prefs', 'keep-awake'],
    queryFn: getKeepAwake,
    networkMode: 'always',
  });

  const permissionOk = perms.data ? isLocationReady(perms.data) : true;

  // Android back goes to My Trips; the trip keeps recording in the background.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      router.replace('/driver');
      return true;
    });
    return () => sub.remove();
  }, [router]);

  // Foreground fix while D5 is open: follows the truck between recorded points and tells
  // "standing still" apart from "tracking broke".
  useEffect(() => {
    if (!permissionOk) return;
    return watchForegroundFix(
      (f) => setFix({ lat: f.lat, lng: f.lng, accuracy: f.accuracy, recordedAt: f.timestamp }),
      () => setFix(null),
    );
  }, [permissionOk]);

  useEffect(() => {
    if (!keepAwake.data) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => undefined);
  }, [keepAwake.data]);

  const points: TrackPoint[] = useMemo(
    () =>
      (live.data?.route ?? []).map((p) => ({
        lat: p.lat,
        lng: p.lng,
        accuracy: p.accuracy_m,
        heading: p.heading,
        recordedAt: Date.parse(p.recorded_at),
      })),
    [live.data?.route],
  );
  const distanceM = useMemo(() => approxDistanceM(points), [points]);

  if (live.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const state = live.data?.state ?? null;
  // Ended (here or by a sync) → the summary is the right screen.
  if (state && state.state !== 'TRACKING') return <Redirect href={`/driver/trips/${id}/summary`} />;

  const load = trip.data?.load ?? null;
  const lastPoint = points.at(-1) ?? null;
  const pos = currentPosition(lastPoint, fix, now);
  const startedAt = state?.started_at ?? trip.data?.started_at ?? null;
  const drop = load ? { lat: load.drop_lat, lng: load.drop_lng } : null;
  const toDrop = drop && load ? dropInfo(pos, drop, load.drop_radius_m) : null;
  const sync = syncStatus(live.data?.pending ?? 0, online);
  const gps: GpsStatus = state
    ? gpsStatus({
        now,
        startedAt: startedAt ? Date.parse(startedAt) : null,
        lastPoint,
        permissionOk,
        servicesEnabled: perms.data?.servicesEnabled ?? true,
        taskRunning: live.data?.taskRunning ?? null,
        currentFix: fix,
      })
    : { kind: 'not-running' };

  async function fixProblem() {
    if (gps.kind === 'permission') router.push('/permissions');
    else if (gps.kind === 'gps-off') await openLocationServicesSettings();
    else await restartTracking();
    await qc.invalidateQueries({ queryKey: ['tracking'] });
  }

  async function endTrip() {
    setEnding(true);
    setError(null);
    try {
      const { engine } = await getTracking();
      await engine.endTrip();
    } catch (e) {
      // NO_ACTIVE_TRIP: already ended (e.g. by a sync) → the summary shows where it stands.
      if (!(e instanceof TripError && e.code === 'NO_ACTIVE_TRIP')) {
        setError(s.endFailed);
        setEnding(false);
        setSheet(false);
        return;
      }
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['tracking'] }),
      qc.invalidateQueries({ queryKey: localTripQueryKey }),
      qc.invalidateQueries({ queryKey: driverTripKeys.detail(id) }),
      qc.invalidateQueries({ queryKey: ['driver', 'trips'] }),
    ]);
    router.replace(`/driver/trips/${id}/summary`);
  }

  return (
    <View style={styles.flex}>
      <MapView
        testID="d5-map"
        height={Math.round(height * 0.45)}
        center={pos ?? drop ?? undefined}
        zoom={15}
        follow={pos}
        markers={[
          ...(drop ? [{ id: 'drop', kind: 'drop' as const, position: drop }] : []),
          ...(pos
            ? [
                {
                  id: 'truck',
                  kind: 'truck' as const,
                  position: pos,
                  heading: lastPoint?.heading ?? undefined,
                },
              ]
            : []),
        ]}
        circles={drop && load ? [{ id: 'drop-radius', center: drop, radiusM: load.drop_radius_m }] : []}
        polylines={points.length > 1 ? [{ id: 'route', kind: 'actual', path: points }] : []}
      />
      <SafeAreaView edges={['top']} style={styles.topCard} pointerEvents="box-none">
        <View style={styles.topCardInner}>
          <Chip label={s.live} tone="live" icon="sensors" />
          <Text variant="bodyStrong" numberOfLines={1} style={styles.flex}>
            {load ? `${load.load_code} · ${s.to(shortPlace(load.drop_address))}` : ''}
          </Text>
        </View>
      </SafeAreaView>

      <SafeAreaView edges={['bottom']} style={styles.panel}>
        <ScrollView contentContainerStyle={styles.panelContent}>
          {!state ? <Banner tone="error" message={s.notTracking} testID="d5-not-tracking" /> : null}
          {state && isTrackingProblem(gps) ? (
            <ProblemBanner gps={gps} onFix={() => void fixProblem()} />
          ) : null}
          {toDrop?.inside ? (
            <View style={styles.nearDrop} testID="d5-near-drop" accessibilityLiveRegion="polite">
              <MaterialIcons name="flag" size={22} color={colors.verified} />
              <Text variant="bodyStrong" style={{ color: colors.verified }}>
                {s.nearDrop}
              </Text>
            </View>
          ) : null}

          <View style={styles.stats}>
            <Stat
              testID="d5-time"
              value={startedAt ? formatDuration(startedAt, new Date(now).toISOString()) : '—'}
              label={s.time}
            />
            <Stat
              testID="d5-distance"
              value={formatKmStat(distanceM)}
              label={s.distance}
              caption={s.approx}
            />
            <Stat
              testID="d5-to-drop"
              value={toDrop ? formatKmStat(toDrop.distanceM) : '—'}
              label={s.toDrop}
              caption={toDrop ? s.approx : undefined}
            />
          </View>

          <SyncRow sync={sync} />
          <GpsRow gps={gps} />

          <View style={styles.keepAwake}>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{s.keepAwake}</Text>
              <Text variant="caption" tone="secondary">
                {s.keepAwakeHint}
              </Text>
            </View>
            <Switch
              testID="d5-keep-awake"
              accessibilityLabel={s.keepAwake}
              value={!!keepAwake.data}
              onValueChange={(v) => {
                qc.setQueryData(['prefs', 'keep-awake'], v);
                void setKeepAwake(v);
              }}
            />
          </View>

          {error ? <Banner tone="error" message={error} testID="d5-error" /> : null}
          <Button
            label={s.end}
            variant={toDrop?.inside ? 'danger' : 'dangerOutline'}
            size="driver"
            icon="stop"
            disabled={!state}
            onPress={() => setSheet(true)}
            testID="d5-end"
          />
        </ScrollView>
      </SafeAreaView>

      <EndSheet
        visible={sheet}
        outsideM={toDrop && !toDrop.inside ? toDrop.distanceM : null}
        ending={ending}
        onCancel={() => setSheet(false)}
        onConfirm={() => void endTrip()}
      />
    </View>
  );
}

/** "186 km" / "0.8 km" for the big stat numbers. */
function formatKmStat(m: number): string {
  const tenths = Math.round(m / 100) / 10; // 9_960 m → 10 km, not "10.0 km"
  return `${tenths >= 10 ? Math.round(m / 1000) : tenths.toFixed(1)} km`;
}

function Stat({
  value,
  label,
  caption,
  testID,
}: {
  value: string;
  label: string;
  caption?: string;
  testID: string;
}) {
  return (
    <View style={styles.stat} testID={testID}>
      <Text variant="digit" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="caption" tone="secondary">
        {label}
        {caption ? ` · ${caption}` : ''}
      </Text>
    </View>
  );
}

function StatusLine({
  icon,
  color,
  text,
  testID,
}: {
  icon: 'cloud-done' | 'cloud-upload' | 'cloud-off' | 'gps-fixed' | 'gps-not-fixed' | 'pause-circle-outline';
  color: string;
  text: string;
  testID: string;
}) {
  return (
    <View style={styles.statusLine} testID={testID} accessibilityLabel={text}>
      <MaterialIcons name={icon} size={20} color={color} />
      <Text style={[styles.flex, { color }]}>{text}</Text>
    </View>
  );
}

function SyncRow({ sync }: { sync: SyncStatus }) {
  switch (sync.kind) {
    case 'synced':
      return <StatusLine testID="d5-sync-synced" icon="cloud-done" color={colors.verified} text={s.synced} />;
    case 'waiting':
      return (
        <StatusLine
          testID="d5-sync-waiting"
          icon="cloud-upload"
          color={colors.textSecondary}
          text={s.waiting(sync.pending)}
        />
      );
    case 'offline':
      return (
        <StatusLine
          testID="d5-sync-offline"
          icon="cloud-off"
          color={colors.review}
          text={s.offline(sync.pending)}
        />
      );
  }
}

function GpsRow({ gps }: { gps: GpsStatus }) {
  switch (gps.kind) {
    case 'good':
      return (
        <StatusLine
          testID="d5-gps-good"
          icon="gps-fixed"
          color={colors.verified}
          text={s.gpsGood(gps.accuracyM)}
        />
      );
    case 'weak':
      return (
        <StatusLine
          testID="d5-gps-weak"
          icon="gps-not-fixed"
          color={colors.review}
          text={s.gpsWeak(gps.accuracyM)}
        />
      );
    case 'waiting':
      return (
        <StatusLine
          testID="d5-gps-waiting"
          icon="gps-not-fixed"
          color={colors.textSecondary}
          text={s.gpsWaiting}
        />
      );
    case 'stopped':
      return (
        <StatusLine
          testID="d5-gps-stopped"
          icon="pause-circle-outline"
          color={colors.textSecondary}
          text={s.gpsStopped}
        />
      );
    default:
      return null; // problems are shown in the banner
  }
}

function ProblemBanner({ gps, onFix }: { gps: GpsStatus; onFix: () => void }) {
  const text =
    gps.kind === 'no-points'
      ? s.problem['no-points'](Math.floor(gps.sinceMs / 60_000))
      : gps.kind === 'permission' || gps.kind === 'gps-off' || gps.kind === 'not-running'
        ? s.problem[gps.kind]
        : '';
  return (
    <View style={styles.problem} testID={`d5-problem-${gps.kind}`}>
      <Banner tone="error" message={text} />
      <Button label={s.fix} variant="danger" icon="build" onPress={onFix} testID="d5-fix" />
    </View>
  );
}

/** End Trip confirmation sheet (docs/12 overlays). Warns outside the drop radius; never blocks. */
function EndSheet({
  visible,
  outsideM,
  ending,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  outsideM: number | null;
  ending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const e = t.endSheet;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={ending ? undefined : onCancel} accessibilityLabel={e.cancel} />
      <SafeAreaView edges={['bottom']} style={styles.sheet} testID="d5-end-sheet">
        <Text variant="title">{e.title}</Text>
        <Text>{e.body}</Text>
        {outsideM !== null ? (
          <Banner tone="warn" message={e.outside(formatShortDistance(outsideM))} testID="d5-end-outside" />
        ) : null}
        <Button
          label={ending ? e.ending : e.confirm}
          variant="danger"
          loading={ending}
          onPress={onConfirm}
          testID="d5-end-confirm"
        />
        <Button
          label={e.cancel}
          variant="outline"
          disabled={ending}
          onPress={onCancel}
          testID="d5-end-cancel"
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  topCard: { position: 'absolute', top: 0, left: 0, right: 0, padding: space.md },
  topCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.md,
    boxShadow: '0px 2px 8px rgba(15, 42, 68, 0.12)',
  },
  panel: {
    flex: 1,
    marginTop: -space.lg,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card + 8,
    borderTopRightRadius: radius.card + 8,
  },
  panelContent: { padding: space.lg, gap: space.md },
  nearDrop: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    padding: space.md,
    borderRadius: radius.input,
    backgroundColor: colors.verifiedSoft,
  },
  stats: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, gap: 2 },
  statusLine: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  keepAwake: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  problem: { gap: space.sm },
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    padding: space.lg,
    gap: space.md,
    borderTopLeftRadius: radius.card + 8,
    borderTopRightRadius: radius.card + 8,
  },
});

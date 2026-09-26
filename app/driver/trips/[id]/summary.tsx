import { MaterialIcons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, type ComponentProps } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/ui';
import { formatDistanceKm, formatDuration } from '@/features/loads/status';
import { fetchTripSummary, shortPlace, summaryKeys, useDriverStats } from '@/features/trips/api';
import { isFinalStatus, reasonViews, summaryState, type SummaryState } from '@/features/trips/summaryModel';
import { useTripRealtime } from '@/features/trips/useTripRealtime';
import { t } from '@/i18n/en';
import { formatDateIST } from '@/lib/dates';
import { getLiveSnapshot, liveTripKey, syncNow } from '@/tracking/liveTrip';
import { colors, radius, space } from '@/theme/tokens';

const s = t.summary;
/** Polling fallback while the result can still change (realtime is the fast path). */
const POLL_MS = 10_000;

type Icon = ComponentProps<typeof MaterialIcons>['name'];
const HEADER: Record<
  Exclude<SummaryState['kind'], 'in-progress'>,
  { icon: Icon | null; color: string; title: string; body: string }
> = {
  verifying: { icon: null, color: colors.textSecondary, title: s.verifyingTitle, body: s.verifyingBody },
  'ended-offline': {
    icon: 'cloud-off',
    color: colors.textSecondary,
    title: s.offlineTitle,
    body: s.offlineBody,
  },
  verified: { icon: 'check-circle', color: colors.verified, title: s.verifiedTitle, body: s.verifiedBody },
  'needs-review': { icon: 'warning-amber', color: colors.review, title: s.reviewTitle, body: s.reviewBody },
  rejected: { icon: 'cancel', color: colors.danger, title: s.rejectedTitle, body: s.rejectedBody },
  cancelled: { icon: 'block', color: colors.textSecondary, title: s.cancelledTitle, body: s.cancelledBody },
  unknown: { icon: 'help-outline', color: colors.textSecondary, title: s.unknownTitle, body: '' },
};

/** D6 Trip Summary (docs/12 D6): Verifying → Verified / Needs review, or ended offline. */
export default function TripSummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const server = useQuery({
    queryKey: summaryKeys.trip(id),
    queryFn: () => fetchTripSummary(id),
    // Stop polling once the result is final (realtime is the fast path; this is the fallback).
    refetchInterval: (q) => (isFinalStatus(q.state.data?.status) ? false : POLL_MS),
  });
  const final = isFinalStatus(server.data?.status);
  const local = useQuery({
    queryKey: liveTripKey(id),
    queryFn: () => getLiveSnapshot(id),
    networkMode: 'always',
    // Keep reading until the local copy is gone too (the runtime deletes it after the sync).
    refetchInterval: (q) => (final && !q.state.data?.state ? false : 5_000),
  });
  useTripRealtime(id, !final, () => void server.refetch());
  // The local state moving on (ENDED_PENDING_SYNC → ENDED → cleaned up) means the end reached
  // the server: fetch the row now rather than at the next poll.
  const localName = local.data ? (local.data.state?.state ?? 'none') : null;
  const refetchServer = server.refetch;
  useEffect(() => {
    if (localName !== null) void refetchServer();
  }, [localName, refetchServer]);

  const localState = local.data?.state
    ? { state: local.data.state.state, pending: local.data.pending }
    : null;
  const state = summaryState({ local: localState, serverStatus: server.data?.status ?? null });
  const stats = useDriverStats(state.kind === 'verified');

  if (local.isPending || (server.isPending && !localState)) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (state.kind === 'in-progress') return <Redirect href={`/driver/trips/${id}/live`} />;

  const row = server.data;
  const head = HEADER[state.kind];
  const reasons = reasonViews(row?.verification_reasons, row?.verification_metrics);
  const endedAt = row?.ended_at ?? local.data?.state?.ended_at ?? null;
  const startedAt = row?.started_at ?? local.data?.state?.started_at ?? null;

  return (
    <Screen scroll>
      <View style={styles.header} testID={`d6-${state.kind}`}>
        {head.icon ? (
          <MaterialIcons name={head.icon} size={72} color={head.color} />
        ) : (
          <ActivityIndicator size="large" color={head.color} style={styles.spinner} />
        )}
        <Text variant="title" align="center" accessibilityRole="header">
          {head.title}
        </Text>
        {head.body ? (
          <Text tone="secondary" align="center">
            {head.body}
          </Text>
        ) : null}
        {state.kind === 'ended-offline' && state.pending > 0 ? (
          <Text variant="caption" tone="secondary" align="center" testID="d6-pending">
            {s.offlinePending(state.pending)}
          </Text>
        ) : null}
      </View>

      {state.kind === 'verified' && row ? (
        <Card>
          <View style={styles.statsRow}>
            <View style={styles.flex}>
              <Text variant="display" testID="d6-km">
                {formatDistanceKm(row.tracked_distance_m)}
              </Text>
              <Text variant="caption" tone="secondary">
                {s.kmVerified}
              </Text>
            </View>
            <View style={styles.flex}>
              <Text variant="display">{formatDuration(startedAt, endedAt)}</Text>
              <Text variant="caption" tone="secondary">
                {s.duration}
              </Text>
            </View>
          </View>
        </Card>
      ) : null}

      {(state.kind === 'needs-review' || state.kind === 'rejected') && reasons.length > 0 ? (
        <Card>
          {reasons.map((r) => (
            <View key={r.code} style={styles.reason} testID={`d6-reason-${r.code}`}>
              <MaterialIcons name="error-outline" size={20} color={colors.review} />
              <Text style={styles.flex}>{t.reasons[r.key](r.value)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      {state.kind === 'rejected' && row?.review_note ? (
        <Text tone="secondary" testID="d6-review-note">
          {s.reviewNote(row.review_note)}
        </Text>
      ) : null}

      {row?.load ? (
        <Card>
          <Text variant="caption" tone="secondary">
            {row.load.load_code}
          </Text>
          <Text variant="bodyStrong">
            {shortPlace(row.load.pickup_address)} → {shortPlace(row.load.drop_address)}
            {endedAt ? ` · ${formatDateIST(endedAt)}` : ''}
          </Text>
        </Card>
      ) : null}

      {state.kind === 'verified' && stats.data ? (
        <Text variant="bodyStrong" align="center" testID="d6-total">
          {s.total(stats.data.verified_trips, formatDistanceKm(stats.data.verified_distance_m))}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {state.kind === 'ended-offline' ? (
          <Button
            label={s.retrySync}
            variant="outline"
            icon="cloud-upload"
            onPress={() => void syncNow().then(() => Promise.all([local.refetch(), server.refetch()]))}
            testID="d6-retry"
          />
        ) : null}
        <Button label={s.back} onPress={() => router.replace('/driver')} testID="d6-back" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  header: { alignItems: 'center', gap: space.sm, paddingTop: space.xl },
  spinner: { height: 72 },
  statsRow: { flexDirection: 'row', gap: space.md },
  reason: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    padding: space.sm,
    borderRadius: radius.input,
    backgroundColor: colors.accentSoft,
  },
  actions: { gap: space.sm, marginTop: 'auto' },
});

import { MaterialIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { MapView } from '@/components/map/MapView';
import type { MapMarker } from '@/components/map/types';
import { Banner, Button, Card, Chip, ErrorBanner, Slider, Text } from '@/components/ui';
import { formatPhone } from '@/features/console/consoleData';
import { usePlannedRoute } from '@/features/loads/api';
import { formatDistanceKm, tripChipFor } from '@/features/loads/status';
import {
  ReviewError,
  reviewKeys,
  useConsoleTrip,
  useReviewDecision,
  useTripEvents,
  useTripPoints,
  type ConsoleTrip,
  type RoutePoint,
} from '@/features/review/api';
import { ageText } from '@/features/review/liveBoard';
import {
  appendLivePoint,
  formatDateTimeIST,
  metricItems,
  nextReplayIndex,
  REPLAY_TICK_MS,
  timelineItems,
} from '@/features/review/tripDetail';
import { reasonViews } from '@/features/trips/summaryModel';
import { t, useLanguage } from '@/i18n';
import { errorMessage } from '@/lib/errorMessage';
import { useNow } from '@/lib/useNow';
import { useRealtimeChanges } from '@/lib/useRealtimeChanges';
import { colors, fonts, radius, space, type } from '@/theme/tokens';

const c = t.console.tripDetail;

/** C6 Trip Detail & Review (docs/12 C6, docs/13 P12). */
export default function ConsoleTripDetail() {
  useLanguage(); // re-render on language change (M12a)
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const trip = useConsoleTrip(id);
  const points = useTripPoints(id);
  const events = useTripEvents(id);
  const now = useNow(10_000);
  const live = trip.data?.status === 'in_progress';

  useRealtimeChanges({
    name: `console-trip-${id}`,
    changes: [
      { table: 'trip_live', filter: `trip_id=eq.${id}` },
      { table: 'trips', event: 'UPDATE', filter: `id=eq.${id}` },
    ],
    onChange: (p) => {
      if (p.table === 'trip_live' && p.eventType !== 'DELETE') {
        // Live append: trip_live carries the newest point (trip_points isn't in the publication).
        const n = p.new as { lat: number; lng: number; heading: number | null; recorded_at: string };
        qc.setQueryData<RoutePoint[]>(reviewKeys.points(id), (prev) => appendLivePoint(prev ?? [], n));
        qc.setQueryData<ConsoleTrip | null>(reviewKeys.trip(id), (prev) =>
          prev
            ? { ...prev, live: { lat: n.lat, lng: n.lng, heading: n.heading, recorded_at: n.recorded_at } }
            : prev,
        );
      } else {
        // Status changed (ended, verified, reviewed): reload everything, replacing provisional points.
        void trip.refetch();
        void events.refetch();
        void points.refetch();
      }
    },
    onResync: () => {
      void trip.refetch();
      if (live) void points.refetch();
    },
  });

  if (trip.isPending) return <ActivityIndicator style={styles.center} color={colors.primary} />;
  if (trip.isError || !trip.data) {
    return (
      <View style={styles.page}>
        {trip.isError ? (
          <ErrorBanner error={trip.error} onRetry={() => void trip.refetch()} testID="c6-error" />
        ) : (
          <Banner tone="error" message={c.notFound} />
        )}
        <Button
          label={c.back}
          variant="text"
          icon="arrow-back"
          onPress={() => router.replace('/console/trips')}
        />
      </View>
    );
  }

  const d = trip.data;
  const chip = tripChipFor(d.status);
  const lastAge = d.live ? ageText(Math.max(0, now - Date.parse(d.live.recorded_at))) : null;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Card>
        <View style={styles.header}>
          <View style={styles.codeChip}>
            <Text style={styles.codeText} testID="c6-load-code">
              {d.load?.load_code ?? '—'}
            </Text>
          </View>
          <Chip label={chip.label} tone={chip.tone} icon={chip.icon} />
          {live && lastAge ? <Chip label={c.lastUpdate(lastAge)} tone="live" icon="sensors" /> : null}
          <View style={styles.headerFields}>
            <Field
              label={c.driver}
              value={`${d.driver?.full_name ?? '—'} · ${formatPhone(d.driver?.phone ?? null)}`}
            />
            <Field
              label={c.vehicle}
              value={d.vehicle ? `${d.vehicle.registration_no} · ${d.vehicle.vehicle_type}` : '—'}
            />
            <Field label={c.started} value={d.started_at ? formatDateTimeIST(d.started_at) : '—'} />
            <Field label={c.ended} value={d.ended_at ? formatDateTimeIST(d.ended_at) : '—'} />
          </View>
        </View>
        {d.load ? (
          <Text tone="secondary">
            {d.load.pickup_address} → {d.load.drop_address}
          </Text>
        ) : null}
      </Card>

      <View style={[styles.split, !wide && styles.stack]}>
        <View style={wide ? styles.left : undefined}>
          <RouteCard trip={d} points={points.data ?? null} loading={points.isPending} wide={wide} />
          {points.isError ? (
            <ErrorBanner
              error={points.error}
              onRetry={() => void points.refetch()}
              testID="c6-points-error"
            />
          ) : null}
        </View>
        <View style={[styles.rightCol, wide && styles.right]}>
          <VerificationCard trip={d} />
          <TimelineCard trip={d} events={events.data ?? []} loading={events.isPending} />
          {events.isError ? (
            <ErrorBanner
              error={events.error}
              onRetry={() => void events.refetch()}
              testID="c6-events-error"
            />
          ) : null}
          {d.status === 'needs_review' ? <ReviewCard tripId={d.id} /> : null}
        </View>
      </View>
    </ScrollView>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
      <Text>{value}</Text>
    </View>
  );
}

function RouteCard({
  trip: d,
  points,
  loading,
  wide,
}: {
  trip: ConsoleTrip;
  points: RoutePoint[] | null;
  loading: boolean;
  wide: boolean;
}) {
  const pickup = d.load ? { lat: d.load.pickup_lat, lng: d.load.pickup_lng } : null;
  const drop = d.load ? { lat: d.load.drop_lat, lng: d.load.drop_lng } : null;
  const planned = usePlannedRoute(pickup, drop);
  const [replay, setReplay] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const pts = useMemo(() => points ?? [], [points]);
  const n = pts.length;

  // Play: one step per tick (~300 ticks for the whole trip), stop at the last point.
  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      const next = nextReplayIndex(replay ?? 0, n);
      setReplay(next);
      if (next >= n - 1) setPlaying(false);
    }, REPLAY_TICK_MS);
    return () => clearTimeout(timer);
  }, [playing, replay, n]);

  const idx = replay === null ? null : Math.min(replay, Math.max(0, n - 1));
  const path = idx === null ? pts : pts.slice(0, idx + 1);
  const head = idx === null ? (d.status === 'in_progress' ? pts.at(-1) : undefined) : pts[idx];
  const start =
    pts[0] ?? (d.start_lat !== null && d.start_lng !== null ? { lat: d.start_lat, lng: d.start_lng } : null);
  const end = d.end_lat !== null && d.end_lng !== null ? { lat: d.end_lat, lng: d.end_lng } : null;

  const markers: MapMarker[] = [
    ...(pickup ? [{ id: 'pickup', kind: 'pickup' as const, position: pickup }] : []),
    ...(drop ? [{ id: 'drop', kind: 'drop' as const, position: drop }] : []),
    ...(start ? [{ id: 'start', kind: 'start' as const, position: { lat: start.lat, lng: start.lng } }] : []),
    ...(end ? [{ id: 'end', kind: 'end' as const, position: end }] : []),
    ...(head
      ? [
          {
            id: 'truck',
            kind: 'truck' as const,
            position: { lat: head.lat, lng: head.lng },
            heading: head.heading ?? undefined,
          },
        ]
      : []),
  ];
  const plannedPath = planned.data?.path.length ? planned.data.path : pickup && drop ? [pickup, drop] : [];

  return (
    <Card>
      <MapView
        testID="c6-map"
        height={wide ? 520 : 360}
        fitToContent
        fitKey={`${d.id}:${n > 0}`}
        markers={markers}
        circles={[
          ...(pickup && d.load ? [{ id: 'pickup-r', center: pickup, radiusM: d.load.pickup_radius_m }] : []),
          ...(drop && d.load ? [{ id: 'drop-r', center: drop, radiusM: d.load.drop_radius_m }] : []),
        ]}
        polylines={[
          ...(plannedPath.length > 1 ? [{ id: 'planned', kind: 'planned' as const, path: plannedPath }] : []),
          ...(path.length > 1 ? [{ id: 'actual', kind: 'actual' as const, path }] : []),
        ]}
      />
      {loading ? (
        <Text tone="secondary">{c.pointsLoading}</Text>
      ) : n === 0 ? (
        <Text tone="secondary" testID="c6-no-points">
          {c.noPoints}
        </Text>
      ) : (
        <View style={styles.replay} testID="c6-replay">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? c.pause : c.play}
            testID="c6-play"
            onPress={() => {
              if (!playing && (idx === null || idx >= n - 1)) setReplay(0);
              setPlaying(!playing);
            }}
            style={styles.playButton}
          >
            <MaterialIcons name={playing ? 'pause' : 'play-arrow'} size={28} color={colors.onPrimary} />
          </Pressable>
          <View style={styles.flex}>
            <Slider
              label={c.replay}
              value={idx ?? n - 1}
              min={0}
              max={Math.max(1, n - 1)}
              step={1}
              onChange={(v) => {
                setPlaying(false);
                setReplay(v);
              }}
              format={(v) => {
                const p = pts[Math.min(v, n - 1)];
                return p ? c.replayAt(formatDateTimeIST(p.recorded_at), v + 1, n) : '';
              }}
              testID="c6-replay-slider"
            />
          </View>
        </View>
      )}
    </Card>
  );
}

function VerificationCard({ trip: d }: { trip: ConsoleTrip }) {
  const reasons = reasonViews(d.verification_reasons, d.verification_metrics);
  const metrics = metricItems(d.verification_metrics, d.tracked_distance_m, d.expected_points);
  const reviewer = d.reviewer?.full_name ?? 'admin';
  const outcome =
    d.status === 'verified'
      ? d.review_note
        ? c.approvedBy(reviewer, d.review_note)
        : c.verifiedBySystem(formatDistanceKm(d.tracked_distance_m))
      : d.status === 'rejected'
        ? c.rejectedBy(reviewer, d.review_note ?? '')
        : null;
  return (
    <Card>
      <Text variant="subtitle">{c.verification}</Text>
      {outcome ? (
        <Text
          variant="bodyStrong"
          style={{ color: d.status === 'rejected' ? colors.danger : colors.verified }}
          testID="c6-outcome"
        >
          {outcome}
        </Text>
      ) : null}
      {reasons.length ? (
        <View style={styles.chips} testID="c6-reasons">
          {reasons.map((r) => (
            <Chip
              key={r.code}
              tone="review"
              icon="warning-amber"
              label={`${r.code} · ${t.reasons[r.key](r.value)}`}
            />
          ))}
        </View>
      ) : (
        <Text tone="secondary">{d.verification_metrics ? c.noReasons : c.notVerifiedYet}</Text>
      )}
      {metrics.length ? (
        <View style={styles.metrics} testID="c6-metrics">
          {metrics.map((m) => (
            <View key={m.key} style={styles.metric}>
              <Text variant="caption" tone="secondary">
                {m.label}
              </Text>
              <Text variant="bodyStrong">{m.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const TONE_COLOR = {
  neutral: colors.textSecondary,
  live: colors.live,
  verified: colors.verified,
  review: colors.review,
  danger: colors.danger,
} as const;

function TimelineCard({
  trip: d,
  events,
  loading,
}: {
  trip: ConsoleTrip;
  events: { id: number; type: string; payload: unknown; created_at: string }[];
  loading: boolean;
}) {
  const items = timelineItems(events, d.reviewer?.full_name ?? null);
  return (
    <Card>
      <Text variant="subtitle">{c.timeline}</Text>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : items.length === 0 ? (
        <Text tone="secondary">{c.noEvents}</Text>
      ) : (
        <View testID="c6-timeline">
          {items.map((e) => (
            <View key={e.id} style={styles.event}>
              <View style={[styles.eventDot, { backgroundColor: TONE_COLOR[e.tone] }]} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">
                  {e.label} <Text tone="secondary">{e.time}</Text>
                </Text>
                {e.detail ? (
                  <Text variant="caption" tone="secondary">
                    {e.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

/** Only for needs_review. No optimistic UI: the page shows what the server says after the call. */
function ReviewCard({ tripId }: { tripId: string }) {
  const decide = useReviewDecision(tripId);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(approve: boolean) {
    if (!note.trim()) {
      setError(c.noteRequired);
      return;
    }
    setError(null);
    try {
      await decide.mutateAsync({ approve, note });
      setNote('');
    } catch (e) {
      setError(errorMessage(e instanceof ReviewError ? { message: e.code } : e, c.errors));
    }
  }

  return (
    <Card style={styles.reviewCard}>
      <Text variant="subtitle">{c.review}</Text>
      <Text variant="caption" tone="secondary">
        {c.reviewHint}
      </Text>
      <Text variant="bodyStrong">{c.note}</Text>
      <TextInput
        testID="c6-note"
        accessibilityLabel={c.note}
        placeholder={c.notePlaceholder}
        placeholderTextColor={colors.textSecondary}
        multiline
        numberOfLines={4}
        value={note}
        onChangeText={setNote}
        editable={!decide.isPending}
        style={styles.note}
      />
      {error ? <Banner tone="error" message={error} testID="c6-review-error" /> : null}
      <View style={styles.reviewButtons}>
        <View style={styles.flex}>
          <Button
            label={c.approve}
            variant="success"
            icon="verified"
            loading={decide.isPending && decide.variables?.approve === true}
            disabled={decide.isPending}
            onPress={() => void submit(true)}
            testID="c6-approve"
          />
        </View>
        <View style={styles.flex}>
          <Button
            label={c.reject}
            variant="dangerOutline"
            icon="cancel"
            loading={decide.isPending && decide.variables?.approve === false}
            disabled={decide.isPending}
            onPress={() => void submit(false)}
            testID="c6-reject"
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, marginTop: space.xl },
  page: { padding: space.lg, gap: space.md },
  header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  headerFields: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg, marginLeft: 'auto' },
  field: { gap: 2 },
  codeChip: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.chip,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  codeText: { fontFamily: fonts.semibold, fontSize: 18 },
  split: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stack: { flexDirection: 'column', alignItems: 'stretch' },
  left: { flex: 65 },
  right: { flex: 35, minWidth: 340 },
  rightCol: { gap: space.md },
  replay: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { gap: space.sm },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  metric: { minWidth: 120, gap: 2 },
  event: { flexDirection: 'row', gap: space.sm, paddingVertical: space.xs },
  eventDot: { width: 10, height: 10, borderRadius: 5, marginTop: 7 },
  reviewCard: { borderWidth: 1, borderColor: colors.review },
  note: {
    ...type.body,
    minHeight: 96,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    padding: space.md,
    color: colors.text,
    textAlignVertical: 'top',
  },
  reviewButtons: { flexDirection: 'row', gap: space.sm },
});

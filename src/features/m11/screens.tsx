/**
 * M11 screens: C1 Live Dashboard, C7 Review Queue, C6 Trip Detail & Review,
 * D7 Trip History, D8 My Profile.
 * M12a: all text via i18n, TanStack Query loading/error/retry states, accessibility
 * labels + 48 px targets, colours from src/theme/tokens.ts, memoised map inputs.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';

import { MapplsMap } from '@/components/map/MapplsMap';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { SUPPORTED_LANGUAGES, type AppLanguage } from '@/i18n';
import { applyProfileLanguage, setAppLanguage } from '@/i18n/language';
import { errorMessage } from '@/lib/errors';
import {
  eventText,
  formatAge,
  formatDate,
  formatKm,
  formatMonth,
  formatTime,
  maskPhone,
  reasonText,
  statusText,
} from '@/lib/format';
import { colors, sizes } from '@/theme/tokens';

import {
  fetchDriverProfile,
  fetchLiveTrips,
  fetchTrip,
  fetchTripEvents,
  fetchTripPoints,
  fetchTrips,
  mergePoints,
  reviewTrip,
  signOut,
  subscribe,
} from './data';
import type { Trip, TripEvent, TripPoint, TripStatus } from './types';

const STALE_MS = 15 * 60_000;
/** Polling safety net under realtime (ND-15: ≤ 60 s behind, target ~30 s). */
const POLL_MS = 30_000;
/** Trip statuses that can still change on their own (tracking or verifying). */
const isOpen = (status: TripStatus | undefined) =>
  status === 'in_progress' || status === 'completed';

/** Current time, re-rendering every 30 s so "last update" ages and stale flags keep moving. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

// ---------- small building blocks ----------

function Shell({
  title,
  eyebrow,
  right,
  children,
}: {
  title: string;
  eyebrow?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.flex}>
          {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {right}
      </View>
      {children}
    </ScrollView>
  );
}

function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function Button({
  label,
  a11yLabel,
  onPress,
  tone = 'primary',
  disabled = false,
}: {
  label: string;
  a11yLabel?: string;
  onPress: () => void;
  tone?: 'primary' | 'quiet' | 'danger';
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel ?? label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        tone === 'quiet' && styles.quietButton,
        tone === 'danger' && styles.dangerButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, tone === 'quiet' && styles.quietText]}>{label}</Text>
    </Pressable>
  );
}

type ChipTone = 'neutral' | 'danger' | 'success' | 'live';
function Chip({ children, tone = 'neutral' }: { children: ReactNode; tone?: ChipTone }) {
  return (
    <View style={[styles.chip, chipTone[tone].box]}>
      <Text style={[styles.chipText, chipTone[tone].text]}>{children}</Text>
    </View>
  );
}

const toneFor = (status: TripStatus): ChipTone =>
  status === 'verified'
    ? 'success'
    : status === 'in_progress'
      ? 'live'
      : status === 'needs_review' || status === 'rejected'
        ? 'danger'
        : 'neutral';

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'accent' }) {
  return (
    <View style={styles.kpi} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text
        style={[
          styles.kpiValue,
          tone === 'danger' && { color: colors.dangerText },
          tone === 'accent' && { color: colors.liveText },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function ReasonChips({ reasons }: { reasons: string[] }) {
  return (
    <View style={styles.chips}>
      {reasons.map((reason) => (
        <Chip key={reason} tone="danger">
          {reasonText(reason)}
        </Chip>
      ))}
    </View>
  );
}

// ---------- C1 Live Dashboard ----------

export function LiveDashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const live = useQuery({
    queryKey: ['live-trips'],
    queryFn: fetchLiveTrips,
    refetchInterval: POLL_MS,
  });

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['live-trips'] });
    return subscribe('trip_live', undefined, refresh, refresh);
  }, [queryClient]);

  const trips = useMemo(() => live.data ?? [], [live.data]);
  const markers = useMemo(
    () =>
      trips.map((trip) => ({
        id: trip.trip_id,
        lat: trip.lat,
        lng: trip.lng,
        heading: trip.heading,
        label: trip.driver_name,
      })),
    [trips],
  );
  const now = useNow();
  const stale = trips.filter((trip) => now - new Date(trip.updated_at).getTime() > STALE_MS).length;
  const avgSpeed = trips.length
    ? t('units.kmh', {
        value: Math.round(
          trips.reduce((sum, trip) => sum + (trip.speed_mps ?? 0) * 3.6, 0) / trips.length,
        ),
      })
    : t('common.none');

  return (
    <Shell
      title={t('console.live.title')}
      eyebrow={t('console.live.eyebrow')}
      right={<Chip tone="live">{t('console.live.liveCount', { count: trips.length })}</Chip>}
    >
      <View style={styles.kpiRow}>
        <Kpi label={t('console.live.kpiInProgress')} value={String(trips.length)} tone="accent" />
        <Kpi label={t('console.live.kpiStale')} value={String(stale)} tone="danger" />
        <Kpi label={t('console.live.kpiAvgSpeed')} value={avgSpeed} />
      </View>
      {live.isPending ? (
        <LoadingState />
      ) : live.isError ? (
        <ErrorState error={live.error} onRetry={() => void live.refetch()} />
      ) : (
        <>
          <MapplsMap markers={markers} />
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>{t('console.live.activeTrips')}</Text>
            <Text style={styles.muted}>{t('console.live.autoUpdates')}</Text>
          </View>
          {trips.length === 0 ? (
            <EmptyState title={t('console.live.emptyTitle')} body={t('console.live.emptyBody')} />
          ) : (
            trips.map((trip) => {
              const isStale = now - new Date(trip.updated_at).getTime() > STALE_MS;
              const age = formatAge(trip.updated_at, now);
              return (
                <Pressable
                  key={trip.trip_id}
                  onPress={() => router.push(`/console/trips/${trip.trip_id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={t('console.live.rowA11y', {
                    driver: trip.driver_name,
                    load: trip.load_code,
                    age,
                  })}
                  style={styles.touchRow}
                >
                  <Card style={styles.listItem}>
                    <View
                      style={[styles.statusDot, isStale && { backgroundColor: colors.danger }]}
                    />
                    <View style={styles.flex}>
                      <Text style={styles.itemTitle}>{trip.driver_name}</Text>
                      <Text style={styles.muted}>
                        {trip.load_code}
                        {t('common.separator')}
                        {t('units.kmh', { value: Math.round((trip.speed_mps ?? 0) * 3.6) })}
                      </Text>
                    </View>
                    <Text style={[styles.age, isStale && { color: colors.dangerText }]}>{age}</Text>
                  </Card>
                </Pressable>
              );
            })
          )}
        </>
      )}
    </Shell>
  );
}

// ---------- C7 Review Queue ----------

export function ReviewQueueScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const queue = useQuery({
    queryKey: ['trips', 'needs_review'],
    queryFn: async () =>
      (await fetchTrips('needs_review')).sort(
        (a, b) => new Date(a.ended_at ?? 0).getTime() - new Date(b.ended_at ?? 0).getTime(),
      ),
  });
  const trips = queue.data ?? [];

  return (
    <Shell
      title={t('console.review.title')}
      eyebrow={t('console.review.eyebrow')}
      right={<Chip tone="danger">{t('console.review.waitingCount', { count: trips.length })}</Chip>}
    >
      {queue.isPending ? (
        <LoadingState />
      ) : queue.isError ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : trips.length === 0 ? (
        <EmptyState title={t('console.review.emptyTitle')} body={t('console.review.emptyBody')} />
      ) : (
        trips.map((trip) => (
          <ReviewQueueRow
            key={trip.id}
            trip={trip}
            onOpen={() => router.push(`/console/trips/${trip.id}`)}
          />
        ))
      )}
    </Shell>
  );
}

function ReviewQueueRow({ trip, onOpen }: { trip: Trip; onOpen: () => void }) {
  const { t } = useTranslation();
  const planned = useMemo(
    () => [
      { lat: trip.pickup_lat, lng: trip.pickup_lng },
      { lat: trip.drop_lat, lng: trip.drop_lng },
    ],
    [trip.pickup_lat, trip.pickup_lng, trip.drop_lat, trip.drop_lng],
  );
  const date = formatDate(trip.ended_at);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={t('console.review.rowA11y', {
        load: trip.load_code,
        driver: trip.driver_name,
        date,
      })}
    >
      <Card style={styles.queueItem}>
        <View style={styles.queueMap}>
          <MapplsMap compact planned={planned} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.itemTitle}>{trip.load_code}</Text>
          <Text style={styles.muted}>
            {t('console.review.endedOn', { driver: trip.driver_name, date })}
          </Text>
          <ReasonChips reasons={trip.verification_reasons} />
          <Text style={styles.link}>{t('console.review.open')}</Text>
        </View>
      </Card>
    </Pressable>
  );
}

// ---------- C6 Trip Detail & Review ----------

function EventTimeline({ events }: { events: TripEvent[] }) {
  return (
    <View>
      {events.map((event, index) => (
        <View key={event.id} style={styles.event}>
          <View style={styles.eventRail}>
            <View style={styles.eventDot} />
            {index < events.length - 1 ? <View style={styles.eventLine} /> : null}
          </View>
          <View style={styles.flex}>
            <Text style={styles.itemTitle}>{eventText(event.type)}</Text>
            <Text style={styles.muted}>
              {formatDate(event.created_at)} · {formatTime(event.created_at)}
            </Text>
            {typeof event.payload?.note === 'string' ? (
              <Text style={styles.eventNote}>“{event.payload.note}”</Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export function TripDetailReviewScreen() {
  const { t } = useTranslation();
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const tripQuery = useQuery({
    queryKey: ['trip', id],
    queryFn: () => fetchTrip(id),
    enabled: Boolean(id),
    refetchInterval: (query) => (isOpen(query.state.data?.status) ? POLL_MS : false),
  });
  const tripOpen = isOpen(tripQuery.data?.status);
  const pointsQuery = useQuery({
    queryKey: ['trip-points', id],
    queryFn: () => fetchTripPoints(id),
    enabled: Boolean(id),
    refetchInterval: tripQuery.data?.status === 'in_progress' ? POLL_MS : false,
  });
  const eventsQuery = useQuery({
    queryKey: ['trip-events', id],
    queryFn: () => fetchTripEvents(id),
    enabled: Boolean(id),
    refetchInterval: tripOpen ? POLL_MS : false,
  });
  const [replay, setReplay] = useState<number | null>(null); // null = show the whole route
  const [playing, setPlaying] = useState(false);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!id) return;
    const refetchTrip = () => {
      void queryClient.invalidateQueries({ queryKey: ['trip', id] });
      void queryClient.invalidateQueries({ queryKey: ['trip-events', id] });
    };
    // New points are appended from the realtime payload instead of re-downloading the route.
    const stopPoints = subscribe(
      'trip_points',
      `trip_id=eq.${id}`,
      (row) => {
        if (row)
          queryClient.setQueryData<TripPoint[]>(['trip-points', id], (current = []) =>
            mergePoints(current, [row as TripPoint]),
          );
      },
      () => void queryClient.invalidateQueries({ queryKey: ['trip-points', id] }),
    );
    const stopTrip = subscribe('trips', `id=eq.${id}`, refetchTrip, refetchTrip);
    return () => {
      stopPoints();
      stopTrip();
    };
  }, [id, queryClient]);

  const points = useMemo(() => pointsQuery.data ?? [], [pointsQuery.data]);
  const position = replay ?? Math.max(points.length - 1, 0);

  useEffect(() => {
    if (!playing || !points.length) return;
    const timer = setInterval(() => {
      setReplay((current) => {
        const next = (current ?? -1) + 1;
        if (next >= points.length - 1) setPlaying(false);
        return Math.min(next, points.length - 1);
      });
    }, 700);
    return () => clearInterval(timer);
  }, [playing, points.length]);

  const trip = tripQuery.data;
  const planned = useMemo(
    () =>
      trip
        ? [
            { lat: trip.pickup_lat, lng: trip.pickup_lng },
            { lat: trip.drop_lat, lng: trip.drop_lng },
          ]
        : [],
    [trip],
  );
  const markers = useMemo(
    () =>
      trip
        ? [
            { id: 'start', lat: trip.pickup_lat, lng: trip.pickup_lng, label: t('map.start') },
            { id: 'end', lat: trip.drop_lat, lng: trip.drop_lng, label: t('map.end') },
          ]
        : [],
    [trip, t],
  );
  const recorded = useMemo(() => points.slice(0, position + 1), [points, position]);

  const decide = async (approve: boolean) => {
    if (!note.trim()) {
      Alert.alert(t('console.trip.noteRequiredTitle'), t('rpc.NOTE_REQUIRED'));
      return;
    }
    setSubmitting(true);
    try {
      await reviewTrip(id, approve, note);
      setNote('');
      // No optimistic UI: show exactly what the server decided.
      await Promise.all([tripQuery.refetch(), eventsQuery.refetch()]);
    } catch (error) {
      Alert.alert(t('console.trip.reviewFailedTitle'), errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const failed = [tripQuery, pointsQuery, eventsQuery].find((query) => query.isError);
  if (tripQuery.isPending) {
    return (
      <Shell title={t('console.trip.title')}>
        <LoadingState />
      </Shell>
    );
  }
  if (failed) {
    return (
      <Shell title={t('console.trip.title')}>
        <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
      </Shell>
    );
  }
  if (!trip) {
    return (
      <Shell title={t('console.trip.title')}>
        <EmptyState title={t('console.trip.notFound')} body={t('rpc.TRIP_NOT_FOUND')} />
      </Shell>
    );
  }

  const metrics = trip.verification_metrics ?? {};
  const total = points.length;
  const step = (delta: number) => {
    setPlaying(false);
    setReplay(Math.max(0, Math.min(total - 1, position + delta)));
  };

  return (
    <Shell
      title={trip.load_code}
      eyebrow={t('console.trip.eyebrow')}
      right={<Chip tone={toneFor(trip.status)}>{statusText(trip.status, 'console')}</Chip>}
    >
      <Card>
        <Text style={styles.routeText}>{trip.pickup_address}</Text>
        <Text style={styles.routeArrow} accessibilityElementsHidden importantForAccessibility="no">
          ↓
        </Text>
        <Text style={styles.routeText}>{trip.drop_address}</Text>
        <Text style={styles.muted}>
          {trip.driver_name} · {formatDate(trip.started_at)} ·{' '}
          {formatKm(trip.tracked_distance_m ?? trip.planned_distance_m)}
        </Text>
      </Card>
      <MapplsMap planned={planned} points={recorded} markers={markers} />
      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.sectionTitle}>{t('console.trip.replay')}</Text>
          <Text style={styles.muted}>
            {total
              ? t('console.trip.replayCount', { current: position + 1, total })
              : t('console.trip.noPoints')}
          </Text>
        </View>
        <View
          style={styles.sliderHit}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('console.trip.sliderA11y')}
          accessibilityValue={{
            text: total
              ? t('console.trip.sliderValue', { current: position + 1, total })
              : t('console.trip.noPoints'),
          }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) =>
            step(event.nativeEvent.actionName === 'increment' ? 1 : -1)
          }
        >
          <View style={styles.sliderTrack}>
            <View
              style={[
                styles.sliderFill,
                { width: `${total ? ((position + 1) / total) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>
        <View style={styles.actionRow}>
          <Button
            label="‹"
            a11yLabel={t('console.trip.stepBack')}
            tone="quiet"
            disabled={!total || position === 0}
            onPress={() => step(-1)}
          />
          <View style={styles.flex}>
            <Button
              label={playing ? t('console.trip.pause') : t('console.trip.play')}
              tone="quiet"
              disabled={!total}
              onPress={() => {
                if (!playing && position >= total - 1) setReplay(0);
                setPlaying((value) => !value);
              }}
            />
          </View>
          <Button
            label="›"
            a11yLabel={t('console.trip.stepForward')}
            tone="quiet"
            disabled={!total || position >= total - 1}
            onPress={() => step(1)}
          />
        </View>
      </Card>
      <View style={styles.kpiRow}>
        <Kpi label={t('console.trip.kpiPoints')} value={String(metrics.points ?? total)} />
        <Kpi
          label={t('console.trip.kpiAvgSpeed')}
          value={
            metrics.avg_kmh != null ? t('units.kmh', { value: metrics.avg_kmh }) : t('common.none')
          }
        />
        <Kpi
          label={t('console.trip.kpiMaxGap')}
          value={
            metrics.max_gap_s != null
              ? t('units.minutes', { value: Math.round(metrics.max_gap_s / 60) })
              : t('common.none')
          }
        />
      </View>
      {trip.verification_reasons.length ? (
        <Card>
          <Text style={styles.sectionTitle}>{t('console.trip.flags')}</Text>
          <ReasonChips reasons={trip.verification_reasons} />
        </Card>
      ) : null}
      <Card>
        <Text style={styles.sectionTitle}>{t('console.trip.timeline')}</Text>
        <EventTimeline events={eventsQuery.data ?? []} />
      </Card>
      {trip.status === 'needs_review' ? (
        <Card>
          <Text style={styles.sectionTitle}>{t('console.trip.reviewTitle')}</Text>
          <Text style={styles.muted}>{t('console.trip.reviewHint')}</Text>
          <ReasonChips reasons={trip.verification_reasons} />
          <TextInput
            value={note}
            onChangeText={setNote}
            multiline
            placeholder={t('console.trip.notePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel={t('console.trip.noteA11y')}
            style={styles.note}
          />
          <View style={styles.actionRow}>
            <View style={styles.flex}>
              <Button
                label={t('console.trip.reject')}
                tone="danger"
                disabled={submitting}
                onPress={() => void decide(false)}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label={t('console.trip.approve')}
                disabled={submitting}
                onPress={() => void decide(true)}
              />
            </View>
          </View>
        </Card>
      ) : null}
    </Shell>
  );
}

// ---------- D7 Trip History ----------

const HISTORY_FILTERS = ['all', 'in_progress', 'verified', 'needs_review', 'rejected'] as const;

export function TripHistoryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof HISTORY_FILTERS)[number]>('all');
  const history = useQuery({ queryKey: ['trips', 'mine'], queryFn: () => fetchTrips() });

  const grouped = useMemo(() => {
    const trips = (history.data ?? []).filter((trip) => filter === 'all' || trip.status === filter);
    return trips.reduce<Record<string, Trip[]>>((acc, trip) => {
      const key = trip.ended_at ? formatMonth(trip.ended_at) : t('driver.history.active');
      (acc[key] ??= []).push(trip);
      return acc;
    }, {});
  }, [history.data, filter, t]);

  const filterLabel = (value: (typeof HISTORY_FILTERS)[number]) =>
    value === 'all' ? t('driver.history.all') : statusText(value, 'driver');

  return (
    <Shell title={t('driver.history.title')} eyebrow={t('driver.history.eyebrow')}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {HISTORY_FILTERS.map((value) => (
          <Pressable
            key={value}
            onPress={() => setFilter(value)}
            accessibilityRole="button"
            accessibilityLabel={t('driver.history.filterA11y', { filter: filterLabel(value) })}
            accessibilityState={{ selected: filter === value }}
            style={[styles.filter, filter === value && styles.filterActive]}
          >
            <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>
              {filterLabel(value)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {history.isPending ? (
        <LoadingState />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : Object.keys(grouped).length === 0 ? (
        <EmptyState title={t('driver.history.emptyTitle')} body={t('driver.history.emptyBody')} />
      ) : (
        Object.entries(grouped).map(([month, trips]) => (
          <View key={month}>
            <Text style={styles.month} accessibilityRole="header">
              {month}
            </Text>
            {trips.map((trip) => {
              const distance = formatKm(trip.tracked_distance_m ?? trip.planned_distance_m);
              const status = statusText(trip.status, 'driver');
              return (
                <Pressable
                  key={trip.id}
                  onPress={() => router.push(`/trips/${trip.id}/summary`)}
                  accessibilityRole="button"
                  accessibilityLabel={t('driver.history.rowA11y', {
                    load: trip.load_code,
                    status,
                    distance,
                  })}
                >
                  <Card style={styles.historyRow}>
                    <View style={styles.flex}>
                      <Text style={styles.itemTitle}>{trip.load_code}</Text>
                      <Text style={styles.muted}>
                        {trip.pickup_address} → {trip.drop_address}
                      </Text>
                      <Text style={styles.muted}>
                        {formatDate(trip.ended_at)} · {distance}
                      </Text>
                    </View>
                    <Chip tone={toneFor(trip.status)}>{status}</Chip>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ))
      )}
    </Shell>
  );
}

// ---------- D8 My Profile ----------

export function ProfileScreen() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const profile = useQuery({ queryKey: ['driver-profile'], queryFn: fetchDriverProfile });
  const [languageOpen, setLanguageOpen] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    if (profile.data) void applyProfileLanguage(profile.data.language);
  }, [profile.data]);

  const chooseLanguage = async (language: AppLanguage) => {
    setLanguageOpen(false);
    try {
      await setAppLanguage(language);
      await queryClient.invalidateQueries({ queryKey: ['driver-profile'] });
    } catch (error) {
      Alert.alert(t('driver.profile.languageSaveFailed'), errorMessage(error));
    }
  };

  if (profile.isPending) {
    return (
      <Shell title={t('driver.profile.title')}>
        <LoadingState />
      </Shell>
    );
  }
  if (profile.isError) {
    return (
      <Shell title={t('driver.profile.title')}>
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      </Shell>
    );
  }

  const { name, phone, stats, active } = profile.data;
  const currentLanguage = (SUPPORTED_LANGUAGES as readonly string[]).includes(i18n.language)
    ? i18n.language
    : 'en';
  const settingRow = (label: string, value: string, onPress: () => void, good = false) => (
    <Pressable
      style={styles.settingRow}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text style={styles.itemTitle}>{label}</Text>
      <Text style={good ? styles.good : styles.muted}>{value}</Text>
    </Pressable>
  );

  return (
    <Shell title={t('driver.profile.title')} eyebrow={t('driver.profile.eyebrow')}>
      <Card>
        <Text style={styles.profileName}>{name}</Text>
        <Text style={styles.muted}>{maskPhone(phone)}</Text>
        <Text style={styles.caption}>{t('driver.profile.readOnly')}</Text>
      </Card>
      <View style={styles.kpiRow}>
        <Kpi
          label={t('driver.profile.verifiedTrips')}
          value={String(stats.verified_trips)}
          tone="accent"
        />
        <Kpi label={t('driver.profile.distance')} value={formatKm(stats.verified_distance_m)} />
        <Kpi label={t('driver.profile.since')} value={formatDate(stats.first_verified_at)} />
      </View>
      <Card>
        <Text style={styles.sectionTitle}>{t('driver.profile.preferences')}</Text>
        {settingRow(t('driver.profile.language'), `${t(`languages.${currentLanguage}`)} ›`, () =>
          setLanguageOpen(true),
        )}
        {settingRow(t('driver.profile.permissions'), t('driver.profile.permissionsStatus'), () =>
          Alert.alert(t('driver.profile.permissions'), t('driver.profile.permissionsBody')),
        )}
        {settingRow(t('driver.profile.battery'), t('driver.profile.batteryStatus'), () =>
          Alert.alert(t('driver.profile.battery'), t('driver.profile.batteryBody')),
        )}
        {settingRow(t('driver.profile.privacy'), t('driver.profile.open'), () =>
          Alert.alert(t('driver.profile.privacy'), t('driver.profile.privacyBody')),
        )}
      </Card>
      <Button
        label={
          signedOut
            ? t('driver.profile.signedOut')
            : active
              ? t('driver.profile.signOutBlocked')
              : t('driver.profile.signOut')
        }
        tone="danger"
        disabled={active || signedOut}
        onPress={() => {
          signOut()
            .then(() => setSignedOut(true))
            .catch((error: unknown) =>
              Alert.alert(t('driver.profile.signOutFailed'), errorMessage(error)),
            );
        }}
      />
      <Modal
        visible={languageOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setLanguageOpen(false)}
      >
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setLanguageOpen(false)}
          accessibilityLabel={t('common.close')}
        >
          <View style={styles.sheet}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {t('driver.profile.chooseLanguage')}
            </Text>
            {SUPPORTED_LANGUAGES.map((language) => (
              <Pressable
                key={language}
                style={styles.languageRow}
                onPress={() => void chooseLanguage(language)}
                accessibilityRole="button"
                accessibilityLabel={t(`languages.${language}`)}
                accessibilityState={{ selected: currentLanguage === language }}
              >
                <Text style={styles.itemTitle}>{t(`languages.${language}`)}</Text>
                {currentLanguage === language ? (
                  <Text style={styles.good}>{t('driver.profile.selected')}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </Shell>
  );
}

// ---------- styles ----------

const chipTone: Record<ChipTone, { box: ViewStyle; text: { color: string } }> = {
  neutral: { box: { backgroundColor: colors.primarySoft }, text: { color: colors.primary } },
  danger: { box: { backgroundColor: colors.reviewSoft }, text: { color: colors.reviewText } },
  success: { box: { backgroundColor: colors.verifiedSoft }, text: { color: colors.verifiedText } },
  live: { box: { backgroundColor: colors.liveSoft }, text: { color: colors.liveText } },
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 1180, alignSelf: 'center', padding: 20, paddingBottom: 48 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 18,
  },
  eyebrow: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginBottom: 4,
  },
  title: { color: colors.primary, fontSize: 28, fontWeight: '800' },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpi: {
    flexGrow: 1,
    flexBasis: 100,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 13,
  },
  kpiLabel: { color: colors.textSecondary, fontSize: 13 },
  kpiValue: {
    color: colors.text,
    fontSize: 21,
    fontWeight: '800',
    marginTop: 7,
    fontVariant: ['tabular-nums'],
  },
  sectionHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  muted: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  touchRow: { minHeight: sizes.minTouch },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 13,
    minHeight: sizes.minTouch,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.live,
    marginRight: 12,
  },
  flex: { flex: 1 },
  itemTitle: { color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 3 },
  age: { color: colors.textSecondary, fontSize: 13 },
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginRight: 6,
    marginBottom: 6,
  },
  chipText: { fontSize: 12, fontWeight: '800' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 9 },
  queueItem: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, padding: 12 },
  queueMap: { width: 160, flexGrow: 1, maxWidth: 240 },
  link: { color: colors.liveText, fontWeight: '800', fontSize: 13, marginTop: 5 },
  routeText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  routeArrow: { color: colors.textSecondary, fontSize: 20, marginVertical: 3 },
  sliderHit: { minHeight: sizes.minTouch, justifyContent: 'center' },
  sliderTrack: { height: 6, backgroundColor: colors.border, borderRadius: 3 },
  sliderFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  rowBetween: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minHeight: sizes.minTouch,
    minWidth: sizes.minTouch,
  },
  quietButton: { backgroundColor: colors.primarySoft },
  dangerButton: { backgroundColor: colors.dangerText },
  buttonText: { color: colors.onPrimary, fontWeight: '800', fontSize: 16, textAlign: 'center' },
  quietText: { color: colors.primary },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
  event: { flexDirection: 'row', gap: 12, minHeight: 58 },
  eventRail: { width: 12, alignItems: 'center' },
  eventDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  eventLine: { flex: 1, width: 1, backgroundColor: colors.border, marginVertical: 3 },
  eventNote: { color: colors.text, fontStyle: 'italic', marginTop: 4 },
  note: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    textAlignVertical: 'top',
    color: colors.text,
    fontSize: 16,
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12, alignItems: 'center' },
  filterRow: { gap: 8, paddingBottom: 14 },
  filter: {
    minHeight: sizes.minTouch,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
  filterActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { color: colors.textSecondary, fontSize: 14 },
  filterTextActive: { color: colors.onPrimary, fontWeight: '800' },
  month: { color: colors.textSecondary, fontWeight: '800', marginVertical: 7 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  profileName: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 4 },
  caption: { color: colors.textSecondary, fontSize: 13, marginTop: 14 },
  settingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minHeight: sizes.minTouch + 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  good: { color: colors.verifiedText, fontWeight: '800', fontSize: 13 },
  sheetBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  languageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: sizes.driverPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
});

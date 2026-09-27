import { MaterialIcons } from '@expo/vector-icons';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { isHovered } from '@/components/console/hover';
import { SearchInput } from '@/components/console/SearchInput';
import { MapView } from '@/components/map/MapView';
import { Banner, Card, ErrorBanner, Text } from '@/components/ui';
import { consoleKeys, useReviewCount } from '@/features/console/queries';
import { reviewKeys, useAssignedToday, useLiveTrips, type LiveTrip } from '@/features/review/api';
import {
  ageText,
  applyLiveChange,
  filterLiveRows,
  istMidnightIso,
  kpis,
  liveRows,
  type LiveRow,
} from '@/features/review/liveBoard';
import { t, useLanguage } from '@/i18n';
import { useNow } from '@/lib/useNow';
import { useRealtimeChanges } from '@/lib/useRealtimeChanges';
import { colors, fonts, radius, space } from '@/theme/tokens';

const c = t.console.live;

/** C1 Live Dashboard (docs/12 C1): every in-progress trip on the map, updated by realtime. */
export default function LiveDashboard() {
  useLanguage(); // re-render on language change (M12a)
  const router = useRouter();
  const qc = useQueryClient();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const now = useNow(10_000);
  const [q, setQ] = useState('');
  const trips = useLiveTrips();
  const review = useReviewCount();
  const since = istMidnightIso(now);
  const assigned = useAssignedToday(since);

  const realtime = useRealtimeChanges({
    name: 'console-live',
    changes: [{ table: 'trip_live' }, { table: 'trips' }],
    onChange: (p) => {
      if (p.table === 'trip_live') {
        const current = qc.getQueryData<LiveTrip[]>(reviewKeys.live);
        const next = current ? applyLiveChange(current, p) : null;
        if (next) qc.setQueryData(reviewKeys.live, next);
        else void trips.refetch();
      } else {
        // A trip started, ended, was assigned or reviewed: refresh the list and counters.
        void trips.refetch();
        void qc.invalidateQueries({ queryKey: reviewKeys.assignedToday });
        void qc.invalidateQueries({ queryKey: consoleKeys.reviewCount });
      }
    },
    // Every (re)subscribe: refetch so nothing missed while disconnected is lost.
    onResync: () => void trips.refetch(),
  });

  const rows = useMemo(() => liveRows(trips.data ?? [], now), [trips.data, now]);
  const shown = filterLiveRows(rows, q);
  const k = kpis(rows, assigned.data ?? null, review.data ?? null);
  const fitKey = rows.map((r) => r.tripId).join(',');

  const map = (
    <MapView
      testID="c1-map"
      height={wide ? 560 : 360}
      fitToContent
      fitKey={fitKey}
      markers={rows
        .filter((r) => r.position)
        .map((r) => ({
          id: r.tripId,
          kind: 'truck' as const,
          position: r.position!,
          heading: r.heading ?? undefined,
          stale: r.stale,
        }))}
      onMarkerPress={(id) => router.push(`/console/trips/${id}`)}
    />
  );

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.kpis} testID="c1-kpis">
        <Kpi value={k.live} label={c.kpiLive} color={colors.live} testID="c1-kpi-live" />
        <Kpi
          value={k.stale}
          label={c.kpiStale}
          color={k.stale ? colors.danger : colors.textSecondary}
          testID="c1-kpi-stale"
        />
        <Kpi value={k.assignedToday} label={c.kpiAssigned} color={colors.text} testID="c1-kpi-assigned" />
        <Kpi
          value={k.needReview}
          label={c.kpiReview}
          color={k.needReview ? colors.review : colors.textSecondary}
          testID="c1-kpi-review"
          onPress={() => router.push('/console/review')}
        />
      </View>
      {realtime === 'retrying' ? (
        <Banner tone="warn" message={c.realtimeRetrying} testID="c1-realtime-retrying" />
      ) : null}
      {trips.isError ? (
        <ErrorBanner error={trips.error} onRetry={() => void trips.refetch()} testID="c1-error" />
      ) : null}

      <View style={[styles.split, !wide && styles.stack]}>
        <View style={wide ? styles.mapCol : undefined}>{map}</View>
        <Card style={wide ? styles.listCol : undefined}>
          <Text variant="subtitle">{c.activeTrips(rows.length)}</Text>
          <SearchInput value={q} onCommit={(v) => setQ(v ?? '')} placeholder={c.search} testID="c1-search" />
          {trips.isPending ? (
            <ActivityIndicator color={colors.primary} />
          ) : shown.length === 0 ? (
            <Text tone="secondary" testID="c1-empty">
              {rows.length === 0 ? c.empty : c.noMatch}
            </Text>
          ) : (
            shown.map((r) => (
              <LiveRowView key={r.tripId} row={r} onPress={() => router.push(`/console/trips/${r.tripId}`)} />
            ))
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

function Kpi({
  value,
  label,
  color,
  testID,
  onPress,
}: {
  value: number | null;
  label: string;
  color: string;
  testID: string;
  onPress?: () => void;
}) {
  const body = (
    <>
      <Text style={[styles.kpiValue, { color }]}>{value ?? '—'}</Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.kpi} testID={testID}>
      {body}
    </Pressable>
  ) : (
    <View style={styles.kpi} testID={testID}>
      {body}
    </View>
  );
}

function LiveRowView({ row, onPress }: { row: LiveRow; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${c.open}: ${row.vehicle}, ${row.driver}`}
      onPress={onPress}
      testID={`c1-row-${row.tripId}`}
      style={(st) => [styles.row, isHovered(st) && styles.rowHover]}
    >
      <View style={styles.rowMain}>
        <Text variant="bodyStrong">{row.vehicle}</Text>
        <Text variant="caption" tone="secondary">
          {row.driver} · {row.loadCode}
        </Text>
        <Text variant="caption" tone="secondary" numberOfLines={1}>
          {row.route}
        </Text>
      </View>
      <View style={styles.age}>
        <View style={[styles.dot, { backgroundColor: row.stale ? colors.danger : colors.verified }]} />
        <View>
          <Text
            variant="caption"
            style={{ color: row.stale ? colors.danger : colors.text }}
            testID={`c1-age-${row.tripId}`}
          >
            {ageText(row.ageMs)}
          </Text>
          {row.stale ? (
            <View style={styles.staleTag}>
              <MaterialIcons name="warning-amber" size={12} color={colors.danger} />
              <Text variant="caption" style={{ color: colors.dangerText }}>
                {c.noRecentData}
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, gap: space.md },
  kpis: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  kpi: {
    flexGrow: 1,
    minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: space.md,
    gap: 2,
  },
  kpiValue: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34 },
  split: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  stack: { flexDirection: 'column', alignItems: 'stretch' },
  mapCol: { flex: 65 },
  listCol: { flex: 35, minWidth: 320 },
  row: {
    flexDirection: 'row',
    gap: space.md,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.input,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowHover: { backgroundColor: colors.surfaceMuted },
  rowMain: { flex: 1, gap: 2 },
  age: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start' },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  staleTag: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});

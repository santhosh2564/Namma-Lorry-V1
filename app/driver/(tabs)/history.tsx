import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Banner, Card, Chip, Screen, Text, type ChipTone } from '@/components/ui';
import { formatDistanceKm } from '@/features/loads/status';
import { shortPlace, useTripHistory, type HistoryRow } from '@/features/trips/api';
import {
  dayMonthIST,
  groupByMonth,
  historyCounts,
  historyStatus,
  matchesFilter,
  type HistoryFilter,
  type HistoryStatus,
} from '@/features/trips/history';
import { t } from '@/i18n/en';
import { colors, fonts, radius, space } from '@/theme/tokens';

const h = t.history;
const FILTERS: HistoryFilter[] = ['all', 'verified', 'review', 'rejected'];
const STATUS_CHIP: Record<
  HistoryStatus,
  { tone: ChipTone; icon: 'verified' | 'warning-amber' | 'cancel' | 'hourglass-top' | 'block' }
> = {
  verified: { tone: 'verified', icon: 'verified' },
  review: { tone: 'review', icon: 'warning-amber' },
  rejected: { tone: 'danger', icon: 'cancel' },
  verifying: { tone: 'neutral', icon: 'hourglass-top' },
  cancelled: { tone: 'neutral', icon: 'block' },
};

/** D7 Trip History (docs/12 D7): filters by status, grouped by month, rows open D6. */
export default function TripHistory() {
  const router = useRouter();
  const history = useTripHistory();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const all = history.data ?? [];
  const counts = historyCounts(all);
  const groups = groupByMonth(all.filter((row) => matchesFilter(row, filter)));

  return (
    <Screen
      scroll
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void history.refetch().finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Text variant="title" accessibilityRole="header">
        {h.title}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {FILTERS.map((f) => {
          const on = f === filter;
          return (
            <Pressable
              key={f}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setFilter(f)}
              testID={`d7-filter-${f}`}
              style={[styles.filter, on && styles.filterOn]}
            >
              <Text variant="bodyStrong" style={{ color: on ? colors.onPrimary : colors.text }}>
                {h.filters[f]}
              </Text>
              <Text variant="caption" style={[styles.count, on && styles.countOn]}>
                {counts[f]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {all.length > 0 ? (
        <Text tone="secondary" testID="d7-summary">
          {h.summary(counts.verified, counts.review)}
        </Text>
      ) : null}
      {history.isError ? <Banner tone="error" message={h.loadFailed} /> : null}

      {history.isSuccess && all.length === 0 ? (
        <View style={styles.empty} testID="d7-empty">
          <MaterialIcons name="history" size={48} color={colors.textSecondary} />
          <Text variant="subtitle">{h.emptyTitle}</Text>
          <Text tone="secondary">{h.emptyBody}</Text>
        </View>
      ) : history.isSuccess && groups.length === 0 ? (
        <Text tone="secondary" testID="d7-empty-filter">
          {h.emptyFilter}
        </Text>
      ) : null}

      {groups.map((g) => (
        <View key={g.key} style={styles.group} testID={`d7-month-${g.key}`}>
          <View style={styles.monthRow}>
            <Text variant="caption" style={styles.month}>
              {g.title.toUpperCase()}
            </Text>
            <Text variant="caption" tone="secondary">
              {h.monthCount(g.trips.length)}
            </Text>
          </View>
          {g.trips.map((row) => (
            <HistoryCard
              key={row.id}
              row={row}
              onPress={() => router.push(`/driver/trips/${row.id}/summary`)}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}

function HistoryCard({ row, onPress }: { row: HistoryRow; onPress: () => void }) {
  const status = historyStatus(row.status);
  const chip = STATUS_CHIP[status];
  const date = row.ended_at ?? row.started_at ?? row.created_at;
  return (
    <Pressable accessibilityRole="link" onPress={onPress} testID={`d7-trip-${row.id}`}>
      <Card>
        <View style={styles.cardRow}>
          <View style={styles.flex}>
            <View style={styles.meta}>
              {row.load ? <Chip label={row.load.load_code} tone="accent" /> : null}
              <Text variant="caption" tone="secondary">
                {dayMonthIST(date)}
              </Text>
            </View>
            <Text variant="bodyStrong" numberOfLines={1}>
              {row.load
                ? `${shortPlace(row.load.pickup_address)} → ${shortPlace(row.load.drop_address)}`
                : '—'}
            </Text>
          </View>
          <View style={styles.right}>
            <Text style={styles.km}>
              {status === 'verified' ? formatDistanceKm(row.tracked_distance_m) : '—'}
            </Text>
            <Chip label={h.status[status]} tone={chip.tone} icon={chip.icon} />
          </View>
          <MaterialIcons name="chevron-right" size={24} color={colors.textSecondary} />
        </View>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: space.xs },
  filters: { gap: space.sm, paddingVertical: space.xs },
  filter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  count: {
    minWidth: 22,
    textAlign: 'center',
    borderRadius: radius.chip,
    backgroundColor: colors.surfaceMuted,
    color: colors.text,
    paddingHorizontal: 6,
  },
  countOn: { backgroundColor: 'rgba(255,255,255,0.2)', color: colors.onPrimary },
  empty: { alignItems: 'center', gap: space.sm, paddingVertical: space.xl },
  group: { gap: space.sm },
  monthRow: { flexDirection: 'row', justifyContent: 'space-between' },
  month: { fontFamily: fonts.semibold, letterSpacing: 0.5, color: colors.textSecondary },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  right: { alignItems: 'flex-end', gap: space.xs },
  km: { fontFamily: fonts.bold, fontSize: 20 },
});

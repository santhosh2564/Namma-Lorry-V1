import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ConsolePage } from '@/components/console/ConsolePage';
import { DataTable, type Column } from '@/components/console/DataTable';
import { SearchInput } from '@/components/console/SearchInput';
import { formatDate } from '@/components/console/table';
import { Button, Chip, FilterChips, Text } from '@/components/ui';
import { pick, useUrlState } from '@/features/console/useUrlState';
import { useLoadsPage, type LoadSort } from '@/features/loads/api';
import { DATE_RANGES, LOAD_STATUSES, PAGE_SIZE } from '@/features/loads/schemas';
import { formatDistanceKm, loadChipFor } from '@/features/loads/status';
import { t } from '@/i18n/en';
import { colors, fonts, radius, space } from '@/theme/tokens';

const copy = t.console.loads;
type Row = NonNullable<ReturnType<typeof useLoadsPage>['data']>['rows'][number];

const columns: Column<Row>[] = [
  {
    key: 'load_code',
    header: copy.cols.code,
    flex: 1.3,
    sortValue: () => null,
    render: (r) => (
      <View style={styles.code}>
        <Text style={styles.codeText}>{r.load_code}</Text>
      </View>
    ),
  },
  {
    key: 'pickup',
    header: copy.cols.pickup,
    flex: 2,
    render: (r) => <Text numberOfLines={2}>{r.pickup_address}</Text>,
  },
  {
    key: 'drop',
    header: copy.cols.drop,
    flex: 2,
    render: (r) => <Text numberOfLines={2}>{r.drop_address}</Text>,
  },
  {
    key: 'planned_distance_m',
    header: copy.cols.planned,
    align: 'right',
    sortValue: () => null,
    render: (r) => <Text style={styles.num}>{formatDistanceKm(r.planned_distance_m)}</Text>,
  },
  {
    key: 'material',
    header: copy.cols.material,
    render: (r) => <Text numberOfLines={1}>{r.material ?? '—'}</Text>,
  },
  {
    key: 'created_at',
    header: copy.cols.created,
    sortValue: () => null,
    render: (r) => <Text>{formatDate(r.created_at)}</Text>,
  },
  {
    key: 'status',
    header: copy.cols.status,
    flex: 1.3,
    render: (r) => {
      const c = loadChipFor(r.load_status);
      return <Chip label={c.label} tone={c.tone} icon={c.icon} />;
    },
  },
  {
    key: 'driver',
    header: copy.cols.driver,
    flex: 1.2,
    render: (r) => <Text numberOfLines={1}>{r.driver_name ?? '—'}</Text>,
  },
];

/** C2 Loads: server-side filters, search, sort and pagination on the load_list view. */
export default function Loads() {
  const router = useRouter();
  const [params, set] = useUrlState<'status' | 'q' | 'range' | 'page' | 'sort' | 'dir'>();
  const status = pick(params.status, ['all', ...LOAD_STATUSES] as const, 'all');
  const range = pick(params.range, DATE_RANGES, 'all');
  const sort = pick<LoadSort>(params.sort, ['created_at', 'load_code', 'planned_distance_m'], 'created_at');
  const dir = pick(params.dir, ['asc', 'desc'] as const, 'desc');
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const q = params.q ?? '';

  const loads = useLoadsPage({ status, q, range, page, sort, dir });

  return (
    <ConsolePage
      actions={
        <Button
          label={`+ ${copy.create}`}
          onPress={() => router.push('/console/loads/new')}
          testID="create-load"
        />
      }
    >
      <View style={styles.filters}>
        <FilterChips
          label="Status"
          options={(['all', ...LOAD_STATUSES] as const).map((s) => ({ value: s, label: copy.status[s] }))}
          selected={[status]}
          onToggle={(v) => set({ status: v === 'all' ? undefined : v, page: undefined })}
        />
        <FilterChips
          label="Date range"
          options={DATE_RANGES.map((r) => ({ value: r, label: copy.ranges[r] }))}
          selected={[range]}
          onToggle={(v) => set({ range: v === 'all' ? undefined : v, page: undefined })}
        />
        <SearchInput
          key={q}
          testID="loads-search"
          value={q}
          placeholder={copy.searchPlaceholder}
          onCommit={(v) => set({ q: v, page: undefined })}
        />
      </View>
      <DataTable
        columns={columns}
        rows={loads.data?.rows}
        rowKey={(r) => r.id!}
        loading={loads.isPending}
        error={loads.isError ? t.console.loadError : null}
        onRetry={() => loads.refetch()}
        emptyText={status !== 'all' || q || range !== 'all' ? copy.noMatch : copy.empty}
        pageSize={PAGE_SIZE}
        sort={{ key: sort, dir }}
        onSortChange={(s) => set({ sort: s.key, dir: s.dir, page: undefined })}
        serverPage={{
          page,
          total: loads.data?.total ?? 0,
          onPageChange: (p) => set({ page: p ? String(p) : undefined }),
        }}
        onRowPress={(r) => router.push(`/console/loads/${r.id}`)}
        rowAccessibilityLabel={(r) => `Open load ${r.load_code}`}
      />
    </ConsolePage>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  code: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.chip,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  codeText: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.3 },
  num: { fontVariant: ['tabular-nums'], fontFamily: fonts.semibold },
});

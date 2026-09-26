import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ConsolePage } from '@/components/console/ConsolePage';
import { DataTable, type Column } from '@/components/console/DataTable';
import { SearchInput } from '@/components/console/SearchInput';
import { formatDate } from '@/components/console/table';
import { Chip, FilterChips, Text } from '@/components/ui';
import { useDriverRows, useVehicleRows } from '@/features/console/queries';
import { pick, useUrlState } from '@/features/console/useUrlState';
import { useTripsPage } from '@/features/loads/api';
import { DATE_RANGES, PAGE_SIZE, TRIP_STATUSES, type TripStatus } from '@/features/loads/schemas';
import { formatDistanceKm, formatDuration, tripChip, tripChipFor } from '@/features/loads/status';
import { t } from '@/i18n/en';
import { fonts, space } from '@/theme/tokens';

const copy = t.console.trips;
type Row = NonNullable<ReturnType<typeof useTripsPage>['data']>['rows'][number];

const columns: Column<Row>[] = [
  {
    key: 'code',
    header: copy.cols.code,
    flex: 1.3,
    render: (r) => <Text style={styles.codeText}>{r.load?.load_code ?? '—'}</Text>,
  },
  {
    key: 'driver',
    header: copy.cols.driver,
    flex: 1.3,
    render: (r) => <Text numberOfLines={1}>{r.driver?.full_name ?? '—'}</Text>,
  },
  {
    key: 'vehicle',
    header: copy.cols.vehicle,
    flex: 1.2,
    render: (r) => <Text numberOfLines={1}>{r.vehicle?.registration_no ?? '—'}</Text>,
  },
  { key: 'started', header: copy.cols.started, render: (r) => <Text>{formatDate(r.started_at)}</Text> },
  { key: 'ended', header: copy.cols.ended, render: (r) => <Text>{formatDate(r.ended_at)}</Text> },
  {
    key: 'duration',
    header: copy.cols.duration,
    render: (r) => <Text>{formatDuration(r.started_at, r.ended_at)}</Text>,
  },
  {
    key: 'km',
    header: copy.cols.km,
    align: 'right',
    render: (r) => (
      <Text style={styles.num}>{r.status === 'verified' ? formatDistanceKm(r.tracked_distance_m) : '—'}</Text>
    ),
  },
  {
    key: 'status',
    header: copy.cols.status,
    flex: 1.2,
    render: (r) => {
      const c = tripChipFor(r.status);
      return <Chip label={c.label} tone={c.tone} icon={c.icon} />;
    },
  },
  {
    key: 'reasons',
    header: copy.cols.reasons,
    align: 'right',
    render: (r) => <Text style={styles.num}>{r.verification_reasons.length || '—'}</Text>,
  },
];

/** C5 Trips: server-side filters (status multi-select, driver, vehicle, date, Load ID search) and pagination. */
export default function Trips() {
  const router = useRouter();
  const [params, set] = useUrlState<'status' | 'driver' | 'vehicle' | 'q' | 'range' | 'page'>();
  const statuses = (params.status ?? '')
    .split(',')
    .filter((s): s is TripStatus => (TRIP_STATUSES as readonly string[]).includes(s));
  const range = pick(params.range, DATE_RANGES, 'all');
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const q = params.q ?? '';

  const drivers = useDriverRows();
  const vehicles = useVehicleRows();
  const trips = useTripsPage({
    statuses,
    driverId: params.driver ?? null,
    vehicleId: params.vehicle ?? null,
    q,
    range,
    page,
  });
  const filtered = statuses.length || params.driver || params.vehicle || q || range !== 'all';

  return (
    <ConsolePage>
      <View style={styles.filters}>
        <FilterChips
          multi
          label="Status"
          options={TRIP_STATUSES.map((s) => ({ value: s, label: tripChip[s].label }))}
          selected={statuses}
          onToggle={(v) => {
            const next = statuses.includes(v) ? statuses.filter((s) => s !== v) : [...statuses, v];
            set({ status: next.length ? next.join(',') : undefined, page: undefined });
          }}
        />
      </View>
      <View style={styles.filters}>
        <FilterChips
          label="Date range"
          options={DATE_RANGES.map((r) => ({ value: r, label: t.console.loads.ranges[r] }))}
          selected={[range]}
          onToggle={(v) => set({ range: v === 'all' ? undefined : v, page: undefined })}
        />
        <FilterChips
          label="Driver"
          options={[
            { value: '', label: copy.allDrivers },
            ...(drivers.data ?? []).map((d) => ({ value: d.id, label: d.fullName })),
          ]}
          selected={[params.driver ?? '']}
          onToggle={(v) => set({ driver: v || undefined, page: undefined })}
        />
      </View>
      <View style={styles.filters}>
        <FilterChips
          label="Vehicle"
          options={[
            { value: '', label: copy.allVehicles },
            ...(vehicles.data ?? []).map((v) => ({ value: v.id, label: v.registrationNo })),
          ]}
          selected={[params.vehicle ?? '']}
          onToggle={(v) => set({ vehicle: v || undefined, page: undefined })}
        />
        <SearchInput
          key={q}
          testID="trips-search"
          value={q}
          placeholder={copy.searchPlaceholder}
          onCommit={(v) => set({ q: v, page: undefined })}
        />
      </View>
      <DataTable
        columns={columns}
        rows={trips.data?.rows}
        rowKey={(r) => r.id}
        loading={trips.isPending}
        error={trips.isError ? t.console.loadError : null}
        onRetry={() => trips.refetch()}
        emptyText={filtered ? copy.noMatch : copy.empty}
        pageSize={PAGE_SIZE}
        minWidth={980}
        serverPage={{
          page,
          total: trips.data?.total ?? 0,
          onPageChange: (p) => set({ page: p ? String(p) : undefined }),
        }}
        // C6 Trip Detail arrives in M11; until then rows open the load.
        onRowPress={(r) => r.load && router.push(`/console/loads/${r.load.id}`)}
        rowAccessibilityLabel={(r) => `Open ${r.load?.load_code ?? 'trip'}`}
      />
    </ConsolePage>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md },
  codeText: { fontFamily: fonts.bold, fontSize: 13 },
  num: { fontVariant: ['tabular-nums'], fontFamily: fonts.semibold },
});

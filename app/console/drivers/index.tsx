import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConsolePage } from '@/components/console/ConsolePage';
import { DataTable, type Column } from '@/components/console/DataTable';
import { formatDate, formatKm } from '@/components/console/table';
import { initials } from '@/components/console/TopBar';
import { Banner, Button, Text } from '@/components/ui';
import { formatPhone, matchesSearch, type DriverRow } from '@/features/console/consoleData';
import { useDriverRows } from '@/features/console/queries';
import { ActivityChip } from '@/features/console/StatusCell';
import { AddDriverDrawer } from '@/features/drivers/AddDriverDrawer';
import { t } from '@/i18n/en';
import { colors, fonts, space } from '@/theme/tokens';

const c = t.console.drivers.cols;
const statusOrder = { on_trip: 0, available: 1, inactive: 2 };

const columns: Column<DriverRow>[] = [
  {
    key: 'name',
    header: c.name,
    flex: 2,
    sortValue: (r) => r.fullName,
    render: (r) => (
      <View style={styles.nameCell}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(r.fullName)}</Text>
        </View>
        <Text variant="bodyStrong" numberOfLines={1}>
          {r.fullName}
        </Text>
      </View>
    ),
  },
  { key: 'phone', header: c.phone, flex: 1.5, render: (r) => <Text numberOfLines={1}>{r.phone}</Text> },
  {
    key: 'trips',
    header: c.trips,
    align: 'right',
    sortValue: (r) => r.verifiedTrips,
    render: (r) => <Text style={styles.num}>{r.verifiedTrips}</Text>,
  },
  {
    key: 'km',
    header: c.km,
    align: 'right',
    sortValue: (r) => r.verifiedKm,
    render: (r) => <Text style={styles.num}>{formatKm(r.verifiedKm)}</Text>,
  },
  {
    key: 'last',
    header: c.last,
    flex: 1.2,
    sortValue: (r) => r.lastTripAt,
    render: (r) => <Text>{formatDate(r.lastTripAt)}</Text>,
  },
  {
    key: 'status',
    header: c.status,
    flex: 1.2,
    sortValue: (r) => statusOrder[r.status],
    render: (r) => <ActivityChip status={r.status} />,
  },
];

/** C8 Drivers. */
export default function Drivers() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const router = useRouter();
  const drivers = useDriverRows();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const rows = useMemo(
    () => drivers.data?.filter((r) => matchesSearch(q ?? '', r.fullName, r.phone)),
    [drivers.data, q],
  );

  return (
    <ConsolePage
      filter={q ? t.console.searchResults(q) : undefined}
      clearLabel={t.console.clearSearch}
      onClearFilter={() => router.setParams({ q: undefined })}
      actions={
        <Button label={`+ ${t.console.drivers.add}`} onPress={() => setAdding(true)} testID="add-driver" />
      }
    >
      {added ? <Banner tone="info" message={added} testID="driver-added" /> : null}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={drivers.isPending}
        error={drivers.isError ? t.console.loadError : null}
        onRetry={() => drivers.refetch()}
        emptyText={q ? t.console.drivers.noMatch : t.console.drivers.empty}
        initialSort={{ key: 'name', dir: 'asc' }}
      />
      <AddDriverDrawer
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(v) => setAdded(t.console.drivers.added(v.fullName, formatPhone(v.phone)))}
      />
    </ConsolePage>
  );
}

const styles = StyleSheet.create({
  nameCell: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bold, fontSize: 12, color: colors.primary },
  num: { fontVariant: ['tabular-nums'], fontFamily: fonts.semibold },
});

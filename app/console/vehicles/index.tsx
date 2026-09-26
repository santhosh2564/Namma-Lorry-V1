import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConsolePage } from '@/components/console/ConsolePage';
import { DataTable, type Column } from '@/components/console/DataTable';
import { formatDate } from '@/components/console/table';
import { Banner, Button, Chip, Text } from '@/components/ui';
import { matchesSearch, type VehicleRow } from '@/features/console/consoleData';
import { useVehicleRows } from '@/features/console/queries';
import { ActivityChip } from '@/features/console/StatusCell';
import { AddVehicleModal } from '@/features/vehicles/AddVehicleModal';
import { vehicleTypeLabel } from '@/features/vehicles/schemas';
import { t, useLanguage } from '@/i18n';
import { colors, fonts, radius, space } from '@/theme/tokens';

const c = t.console.vehicles.cols;

const columns: Column<VehicleRow>[] = [
  {
    key: 'reg',
    get header() {
      return c.reg;
    },
    flex: 1.6,
    sortValue: (r) => r.registrationNo,
    render: (r) => (
      // Indian plate style: black on white with a border.
      <View style={styles.plate}>
        <Text style={styles.plateText}>{r.registrationNo}</Text>
      </View>
    ),
  },
  {
    key: 'type',
    get header() {
      return c.type;
    },
    sortValue: (r) => r.vehicleType,
    render: (r) => <Chip label={vehicleTypeLabel(r.vehicleType)} />,
  },
  {
    key: 'owner',
    get header() {
      return c.owner;
    },
    flex: 1.4,
    sortValue: (r) => r.ownerName,
    render: (r) => <Text>{r.ownerName ?? '—'}</Text>,
  },
  {
    key: 'trips',
    get header() {
      return c.trips;
    },
    align: 'right',
    sortValue: (r) => r.trips,
    render: (r) => <Text style={styles.num}>{r.trips}</Text>,
  },
  {
    key: 'last',
    get header() {
      return c.last;
    },
    flex: 1.2,
    sortValue: (r) => r.lastUsedAt,
    render: (r) => <Text>{formatDate(r.lastUsedAt)}</Text>,
  },
  {
    key: 'status',
    get header() {
      return c.status;
    },
    flex: 1.2,
    sortValue: (r) => r.status,
    render: (r) => <ActivityChip status={r.status} />,
  },
];

/** C9 Vehicles. */
export default function Vehicles() {
  useLanguage(); // re-render on language change (M12a)
  const { q } = useLocalSearchParams<{ q?: string }>();
  const router = useRouter();
  const vehicles = useVehicleRows();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  const rows = useMemo(
    () => vehicles.data?.filter((r) => matchesSearch(q ?? '', r.registrationNo, r.ownerName)),
    [vehicles.data, q],
  );

  return (
    <ConsolePage
      filter={q ? t.console.searchResults(q) : undefined}
      clearLabel={t.console.clearSearch}
      onClearFilter={() => router.setParams({ q: undefined })}
      actions={
        <Button label={`+ ${t.console.vehicles.add}`} onPress={() => setAdding(true)} testID="add-vehicle" />
      }
    >
      {added ? <Banner tone="info" message={added} testID="vehicle-added" /> : null}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={vehicles.isPending}
        error={vehicles.isError ? t.console.loadError : null}
        onRetry={() => vehicles.refetch()}
        emptyText={q ? t.console.vehicles.noMatch : t.console.vehicles.empty}
        initialSort={{ key: 'reg', dir: 'asc' }}
      />
      <AddVehicleModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(v) => setAdded(t.console.vehicles.added(v.registrationNo))}
      />
    </ConsolePage>
  );
}

const styles = StyleSheet.create({
  plate: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: colors.text,
    borderRadius: radius.input / 2,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    backgroundColor: colors.surface,
  },
  plateText: { fontFamily: fonts.bold, letterSpacing: 1, color: colors.text },
  num: { fontVariant: ['tabular-nums'], fontFamily: fonts.semibold },
});

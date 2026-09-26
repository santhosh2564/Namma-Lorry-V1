import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ActivityIndicator, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { SearchSelect } from '@/components/console/SearchSelect';
import { formatDate, formatKm } from '@/components/console/table';
import { MapView } from '@/components/map/MapView';
import { Banner, Button, Card, Chip, ErrorBanner, Text } from '@/components/ui';
import { formatPhone } from '@/features/console/consoleData';
import { useDriverRows, useVehicleRows } from '@/features/console/queries';
import { ActivityChip } from '@/features/console/StatusCell';
import {
  LoadAlreadyOpenError,
  OPEN_TRIP_STATUSES,
  useAssignTrip,
  useLoad,
  usePlannedRoute,
} from '@/features/loads/api';
import { assignSchema, type AssignInput, type AssignValues, type TripStatus } from '@/features/loads/schemas';
import { formatDistanceKm, loadChipFor, tripChipFor } from '@/features/loads/status';
import { vehicleTypeLabel } from '@/features/vehicles/schemas';
import { pick, t, useLanguage } from '@/i18n';
import { colors, fonts, radius, space } from '@/theme/tokens';

const copy = t.console.loadDetail;

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

/** C4 Load Detail & Assign. */
export default function LoadDetail() {
  useLanguage(); // re-render on language change (M12a)
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const detail = useLoad(id);

  if (detail.isPending) return <ActivityIndicator style={styles.center} color={colors.primary} />;
  if (detail.isError || !detail.data) {
    return (
      <View style={styles.pagePad}>
        {detail.isError ? (
          <ErrorBanner error={detail.error} onRetry={() => void detail.refetch()} testID="c4-error" />
        ) : (
          <Banner tone="error" message={copy.notFound} />
        )}
        <Button
          label={copy.back}
          variant="text"
          icon="arrow-back"
          onPress={() => router.replace('/console/loads')}
        />
      </View>
    );
  }

  const { load, trips } = detail.data;
  const openTrip = trips.find((tr) => OPEN_TRIP_STATUSES.includes(tr.status as TripStatus));
  const loadStatus = !openTrip
    ? 'unassigned'
    : openTrip.status === 'assigned'
      ? 'assigned'
      : openTrip.status === 'in_progress'
        ? 'in_trip'
        : 'done';
  const chip = loadChipFor(loadStatus);

  return (
    <ScrollView contentContainerStyle={styles.pagePad}>
      <Card>
        <View style={styles.titleRow}>
          <View style={styles.code}>
            <Text style={styles.codeText} testID="load-code">
              {load.load_code}
            </Text>
          </View>
          <Chip label={chip.label} tone={chip.tone} icon={chip.icon} />
        </View>
        <Text variant="subtitle">
          {load.pickup_address} → {load.drop_address}
        </Text>
        <View style={styles.fields}>
          <Field label={copy.planned} value={formatDistanceKm(load.planned_distance_m)} />
          <Field label={copy.material} value={load.material ?? '—'} />
          <Field label={copy.weight} value={load.weight_kg ? `${Number(load.weight_kg) / 1000} t` : '—'} />
          <Field label={copy.shipper} value={load.shipper?.full_name ?? '—'} />
          <Field
            label={copy.createdBy}
            value={`${load.creator?.full_name || '—'} · ${formatDate(load.created_at)}`}
          />
        </View>
        {load.notes ? <Field label={copy.notes} value={load.notes} /> : null}
      </Card>

      <View style={[styles.cols, wide && styles.row]}>
        <Card style={wide ? styles.mapCol : undefined}>
          <LoadMap load={load} />
        </Card>
        <View style={[styles.side, wide && styles.sideCol]}>
          {openTrip ? <TripCard trip={openTrip} /> : <AssignCard loadId={load.id} />}
        </View>
      </View>

      {trips.length > (openTrip ? 1 : 0) ? (
        <Card>
          <Text variant="subtitle">{copy.trips}</Text>
          {trips.map((tr) => {
            const c = tripChipFor(tr.status);
            return (
              <View key={tr.id} style={styles.histRow}>
                <Chip label={c.label} tone={c.tone} icon={c.icon} />
                <Text style={styles.flex}>
                  {tr.driver?.full_name ?? '—'} · {tr.vehicle?.registration_no ?? '—'}
                </Text>
                <Text variant="caption" tone="secondary">
                  {copy.assigned(formatDate(tr.created_at))}
                </Text>
              </View>
            );
          })}
        </Card>
      ) : null}
    </ScrollView>
  );
}

type LoadRow = NonNullable<ReturnType<typeof useLoad>['data']>['load'];
type TripRow = NonNullable<ReturnType<typeof useLoad>['data']>['trips'][number];

function LoadMap({ load }: { load: LoadRow }) {
  const pickup = { lat: load.pickup_lat, lng: load.pickup_lng };
  const drop = { lat: load.drop_lat, lng: load.drop_lng };
  const route = usePlannedRoute(pickup, drop);
  return (
    <MapView
      testID="load-map"
      height={420}
      fitToContent
      markers={[
        { id: 'pickup', kind: 'pickup', position: pickup },
        { id: 'drop', kind: 'drop', position: drop },
      ]}
      circles={[
        { id: 'pickup-fence', center: pickup, radiusM: load.pickup_radius_m },
        { id: 'drop-fence', center: drop, radiusM: load.drop_radius_m },
      ]}
      polylines={route.data?.path.length ? [{ id: 'planned', kind: 'planned', path: route.data.path }] : []}
    />
  );
}

function TripCard({ trip }: { trip: TripRow }) {
  const c = tripChipFor(trip.status);
  return (
    <Card>
      <View style={styles.titleRow}>
        <Text variant="subtitle">{copy.tripTitle}</Text>
        <View testID="trip-status">
          <Chip label={c.label} tone={c.tone} icon={c.icon} />
        </View>
      </View>
      <Field
        label={copy.driver}
        value={`${trip.driver?.full_name ?? '—'} · ${formatPhone(trip.driver?.phone ?? null)}`}
      />
      <Field
        label={copy.vehicle}
        value={
          trip.vehicle
            ? `${trip.vehicle.registration_no} · ${vehicleTypeLabel(trip.vehicle.vehicle_type)}`
            : '—'
        }
      />
      <Text variant="caption" tone="secondary">
        {copy.assigned(formatDate(trip.created_at))}
      </Text>
      <View style={styles.fields}>
        <Field label={copy.started} value={formatDate(trip.started_at)} />
        <Field label={copy.ended} value={formatDate(trip.ended_at)} />
        <Field label={copy.verifiedKm} value={formatDistanceKm(trip.tracked_distance_m)} />
      </View>
      <Text variant="caption" tone="secondary">
        {copy.assignNote}
      </Text>
    </Card>
  );
}

function AssignCard({ loadId }: { loadId: string }) {
  const drivers = useDriverRows();
  const vehicles = useVehicleRows();
  const assign = useAssignTrip(loadId);
  const { control, handleSubmit, formState } = useForm<AssignInput, unknown, AssignValues>({
    resolver: zodResolver(assignSchema),
  });
  const driverId = useWatch({ control, name: 'driverId' });
  const busyDriver = drivers.data?.find((d) => d.id === driverId && d.status === 'on_trip');
  const submit = handleSubmit(async (v) => {
    try {
      await assign.mutateAsync(v);
    } catch {
      // shown below
    }
  });

  return (
    <Card>
      <Text variant="subtitle">{copy.assignTitle}</Text>
      {drivers.isPending || vehicles.isPending ? <ActivityIndicator color={colors.primary} /> : null}
      {drivers.isError || vehicles.isError ? (
        <ErrorBanner
          error={drivers.error ?? vehicles.error}
          onRetry={() => void Promise.all([drivers.refetch(), vehicles.refetch()])}
          testID="c4-lists-error"
        />
      ) : null}
      <Controller
        control={control}
        name="driverId"
        render={({ field, fieldState }) => (
          <SearchSelect
            testID="assign-driver"
            label={copy.driver}
            placeholder={copy.searchDriver}
            value={field.value}
            onChange={field.onChange}
            error={
              fieldState.error ? pick(copy.errors, fieldState.error.message, t.errors.UNKNOWN) : undefined
            }
            options={(drivers.data ?? []).map((d) => ({
              id: d.id,
              label: d.fullName,
              keywords: d.phone,
              disabled: d.status === 'inactive',
              render: (
                <View style={styles.optRow}>
                  <View style={styles.flex}>
                    <Text variant="bodyStrong">{d.fullName}</Text>
                    <Text variant="caption" tone="secondary">
                      {copy.verifiedStats(d.verifiedTrips, formatKm(d.verifiedKm))}
                    </Text>
                  </View>
                  <ActivityChip status={d.status} />
                </View>
              ),
            }))}
          />
        )}
      />
      {busyDriver ? (
        <Banner tone="warn" message={copy.busyWarning(busyDriver.fullName)} testID="busy-warning" />
      ) : null}
      <Controller
        control={control}
        name="vehicleId"
        render={({ field, fieldState }) => (
          <SearchSelect
            testID="assign-vehicle"
            label={copy.vehicle}
            placeholder={copy.searchVehicle}
            value={field.value}
            onChange={field.onChange}
            error={
              fieldState.error ? pick(copy.errors, fieldState.error.message, t.errors.UNKNOWN) : undefined
            }
            options={(vehicles.data ?? []).map((v) => ({
              id: v.id,
              label: v.registrationNo,
              keywords: v.vehicleType,
              render: (
                <View style={styles.optRow}>
                  <Text variant="bodyStrong" style={styles.flex}>
                    {v.registrationNo} · {vehicleTypeLabel(v.vehicleType)}
                  </Text>
                  <ActivityChip status={v.status} />
                </View>
              ),
            }))}
          />
        )}
      />
      {assign.error ? (
        <Banner
          tone="error"
          message={assign.error instanceof LoadAlreadyOpenError ? copy.alreadyOpen : copy.assignFailed}
        />
      ) : null}
      <Button
        testID="assign-submit"
        label={copy.assign}
        icon="assignment-ind"
        loading={formState.isSubmitting || assign.isPending}
        onPress={submit}
      />
      <Text variant="caption" tone="secondary">
        {copy.assignNote}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { marginTop: space.xxl },
  pagePad: { padding: space.lg, gap: space.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  code: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.chip,
    paddingHorizontal: space.md,
    paddingVertical: 4,
  },
  codeText: { fontFamily: fonts.bold, letterSpacing: 0.5 },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  field: { gap: 2, minWidth: 140 },
  cols: { gap: space.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  mapCol: { flex: 1.6 },
  side: { gap: space.lg },
  sideCol: { flex: 1 },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1 },
});

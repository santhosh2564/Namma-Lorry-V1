import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { MapView } from '@/components/map/MapView';
import type { MapCircle, MapMarker } from '@/components/map/types';
import { Banner, Button, Card, ChoiceChips, Text, TextField } from '@/components/ui';
import { PlannedDistanceError, useCreateLoad, usePlannedRoute, useShippers } from '@/features/loads/api';
import { PlaceField, type PlaceValue } from '@/features/loads/PlaceField';
import {
  createLoadSchema,
  RADIUS_DEFAULT_M,
  type CreateLoadInput,
  type CreateLoadValues,
} from '@/features/loads/schemas';
import { formatDistanceKm, formatEta } from '@/features/loads/status';
import { pick, t, useLanguage } from '@/i18n';
import { isLatLng } from '@/lib/geo';
import { colors, space } from '@/theme/tokens';

const copy = t.console.createLoad;
const msg = (m?: string) => (m ? pick(copy.errors, m, m) : undefined);
const emptyPlace = (): PlaceValue => ({ address: '', radiusM: RADIUS_DEFAULT_M, eLoc: null });

/** C3 Create Load. */
export default function CreateLoad() {
  useLanguage(); // re-render on language change (M12a)
  const router = useRouter();
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const shippers = useShippers();
  const create = useCreateLoad();
  const [pending, setPending] = useState<CreateLoadValues | null>(null);

  const { control, handleSubmit, setValue, getValues, formState } = useForm<
    CreateLoadInput,
    unknown,
    CreateLoadValues
  >({
    resolver: zodResolver(createLoadSchema),
    defaultValues: {
      pickup: emptyPlace() as CreateLoadInput['pickup'],
      drop: emptyPlace() as CreateLoadInput['drop'],
      material: '',
      weightTonnes: '',
      shipperId: null,
      notes: '',
    },
  });
  const pickup = useWatch({ control, name: 'pickup' }) as PlaceValue;
  const drop = useWatch({ control, name: 'drop' }) as PlaceValue;
  const route = usePlannedRoute(pickup, drop);

  async function save(values: CreateLoadValues, skipDistance = false) {
    try {
      const load = await create.mutateAsync({ values, skipDistance });
      router.replace(`/console/loads/${load.id}`);
    } catch (e) {
      setPending(e instanceof PlannedDistanceError ? values : null);
    }
  }
  const submit = handleSubmit((v) => save(v));

  const markers: MapMarker[] = [];
  const circles: MapCircle[] = [];
  for (const [kind, p] of [
    ['pickup', pickup],
    ['drop', drop],
  ] as const) {
    if (isLatLng(p)) {
      markers.push({ id: kind, kind, position: { lat: p.lat!, lng: p.lng! }, draggable: true });
      circles.push({ id: `${kind}-fence`, center: { lat: p.lat!, lng: p.lng! }, radiusM: p.radiusM });
    }
  }

  const pe = formState.errors.pickup;
  const de = formState.errors.drop;
  const routeLine = route.data?.path.length
    ? [{ id: 'planned', kind: 'planned' as const, path: route.data.path }]
    : [];

  const form = (
    <Card style={wide ? styles.formCol : undefined}>
      <Controller
        control={control}
        name="pickup"
        render={({ field }) => (
          <PlaceField
            kind="pickup"
            label={copy.pickup}
            testID="pickup"
            value={field.value as PlaceValue}
            onChange={field.onChange}
            addressError={msg(pe?.address?.message)}
            locationError={msg(pe?.lat?.message ?? pe?.lng?.message)}
          />
        )}
      />
      <View style={styles.divider} />
      <Controller
        control={control}
        name="drop"
        render={({ field }) => (
          <PlaceField
            kind="drop"
            label={copy.drop}
            testID="drop"
            value={field.value as PlaceValue}
            onChange={field.onChange}
            addressError={msg(de?.address?.message)}
            locationError={msg(de?.lat?.message ?? de?.lng?.message)}
          />
        )}
      />
      <View style={styles.divider} />
      <Text variant="subtitle">{copy.details}</Text>
      <Controller
        control={control}
        name="material"
        render={({ field, fieldState }) => (
          <TextField
            testID="load-material"
            label={copy.material}
            value={field.value}
            onChangeText={field.onChange}
            placeholder={copy.materialPlaceholder}
            error={msg(fieldState.error?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="weightTonnes"
        render={({ field, fieldState }) => (
          <TextField
            testID="load-weight"
            label={copy.weight}
            value={field.value}
            onChangeText={field.onChange}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="6.5"
            error={msg(fieldState.error?.message)}
          />
        )}
      />
      <Controller
        control={control}
        name="shipperId"
        render={({ field }) =>
          shippers.data?.length ? (
            <ChoiceChips
              label={copy.shipper}
              options={shippers.data.map((s) => ({ value: s.id, label: s.full_name || '—' }))}
              value={field.value ?? undefined}
              onChange={(v) => field.onChange(v === field.value ? null : v)}
            />
          ) : (
            <View>
              <Text variant="bodyStrong">{copy.shipper}</Text>
              <Text variant="caption" tone="secondary">
                {copy.noShippers}
              </Text>
            </View>
          )
        }
      />
      <Controller
        control={control}
        name="notes"
        render={({ field, fieldState }) => (
          <TextField
            testID="load-notes"
            label={copy.notes}
            value={field.value}
            onChangeText={field.onChange}
            multiline
            numberOfLines={3}
            error={msg(fieldState.error?.message)}
          />
        )}
      />
    </Card>
  );

  const mapCard = (
    <Card style={wide ? styles.mapCol : undefined}>
      <MapView
        testID="create-load-map"
        height={wide ? 520 : 320}
        markers={markers}
        circles={circles}
        polylines={routeLine}
        fitToContent
        onMarkerDragEnd={(id, p) => {
          const key = id === 'pickup' ? 'pickup' : 'drop';
          setValue(key, { ...(getValues(key) as PlaceValue), ...p } as CreateLoadInput['pickup'], {
            shouldValidate: formState.isSubmitted,
          });
        }}
        onPress={(p) => {
          const key = !isLatLng(getValues('pickup'))
            ? 'pickup'
            : !isLatLng(getValues('drop'))
              ? 'drop'
              : null;
          if (key) setValue(key, { ...(getValues(key) as PlaceValue), ...p } as CreateLoadInput['pickup']);
        }}
      />
      <Text variant="caption" tone="secondary">
        {copy.mapHint}
      </Text>
      <View style={styles.strip} testID="planned-strip">
        <Text variant="bodyStrong">
          {route.data
            ? copy.planned(formatDistanceKm(route.data.distanceM), formatEta(route.data.durationS))
            : route.isError
              ? copy.plannedUnavailable
              : copy.plannedPending}
        </Text>
      </View>
    </Card>
  );

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={[styles.cols, wide && styles.row]}>
          {form}
          {mapCard}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        {pending ? (
          <View style={styles.footerMsg}>
            <Banner tone="warn" message={copy.distanceFailed} testID="distance-failed" />
            <Button label={copy.saveWithout} variant="outline" onPress={() => save(pending, true)} />
          </View>
        ) : create.isError ? (
          <View style={styles.footerMsg}>
            <Banner tone="error" message={copy.saveFailed} />
          </View>
        ) : (
          <Text variant="caption" tone="secondary" style={styles.footerMsg}>
            {copy.codeNote}
          </Text>
        )}
        <View style={{ minWidth: 120 }}>
          <Button label={copy.cancel} variant="text" onPress={() => router.back()} />
        </View>
        <View style={{ minWidth: 180 }}>
          <Button
            testID="create-load-submit"
            label={copy.submit}
            icon="add-location-alt"
            loading={formState.isSubmitting || create.isPending}
            onPress={submit}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  scroll: { padding: space.lg },
  cols: { gap: space.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  formCol: { flex: 1.1 },
  mapCol: { flex: 1, position: 'sticky' as 'relative', top: 0 },
  divider: { height: 1, backgroundColor: colors.border },
  strip: { padding: space.md, borderRadius: 12, backgroundColor: colors.accentSoft },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerMsg: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md },
});

import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Banner, Slider, Text, TextField } from '@/components/ui';
import { isLatLng } from '@/lib/geo';
import { FunctionError } from '@/lib/functions';
import { colors, radius, space } from '@/theme/tokens';

import { useAutosuggest } from './api';
import { parseCoords } from './coords';
import { RADIUS_MAX_M, RADIUS_MIN_M } from './schemas';

export interface PlaceValue {
  address: string;
  lat?: number;
  lng?: number;
  eLoc?: string | null;
  radiusM: number;
}

const copy = {
  searchHint: 'Type at least 3 characters to search Mappls',
  noCoords: "Mappls didn't return coordinates for this place. Drop the pin on the map or enter coordinates.",
  needLocation: 'Pick a suggestion, drop the pin on the map, or enter coordinates.',
  located: (lat: number, lng: number) =>
    `Pin at ${lat.toFixed(5)}, ${lng.toFixed(5)}. Drag it on the map to refine.`,
  coords: 'Coordinates (lat, lng)',
  coordsHint: 'e.g. 12.95630, 79.94220',
  coordsInvalid: 'Enter latitude, longitude in decimal degrees.',
  manual: 'Enter coordinates',
  hideManual: 'Hide coordinates',
  searchError: (code: string) =>
    code === 'RATE_LIMITED'
      ? 'Too many searches. Wait a moment.'
      : code === 'CONFIG_MISSING'
        ? 'Address search is not configured (MAPPLS_REST_KEY). Enter the address and coordinates by hand.'
        : "Address search isn't available right now. Enter the address and coordinates by hand.",
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function PlaceField({
  kind,
  label,
  value,
  onChange,
  addressError,
  locationError,
  testID,
}: {
  kind: 'pickup' | 'drop';
  label: string;
  value: PlaceValue;
  onChange: (v: PlaceValue) => void;
  addressError?: string;
  locationError?: string;
  testID: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [noCoords, setNoCoords] = useState(false);
  const [manual, setManual] = useState(false);
  const [coordText, setCoordText] = useState('');
  const debounced = useDebounced(query, 300);
  const suggest = useAutosuggest(open ? debounced : '');
  const located = isLatLng(value);

  const suggestError =
    suggest.error instanceof FunctionError ? suggest.error.code : suggest.error ? 'UNKNOWN' : null;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <MaterialIcons
          name={kind === 'pickup' ? 'place' : 'flag'}
          size={22}
          color={kind === 'pickup' ? colors.verified : colors.danger}
        />
        <Text variant="subtitle">{label}</Text>
      </View>

      <View>
        <TextField
          testID={`${testID}-address`}
          label="Address"
          value={value.address}
          placeholder={
            kind === 'pickup'
              ? 'SIPCOT Industrial Park, Sriperumbudur'
              : 'Kurichi Industrial Estate, Coimbatore'
          }
          onChangeText={(t) => {
            setQuery(t);
            setOpen(true);
            setNoCoords(false);
            // A new address invalidates the old pin until a suggestion, pin or coordinates set it again.
            onChange({ ...value, address: t, lat: undefined, lng: undefined, eLoc: null });
          }}
          error={addressError}
          hint={copy.searchHint}
        />
        {open && debounced.trim().length >= 3 ? (
          <View style={styles.dropdown} accessibilityRole="list" testID={`${testID}-suggestions`}>
            {suggest.isFetching ? <ActivityIndicator color={colors.primary} style={styles.pad} /> : null}
            {suggestError ? <Banner tone="warn" message={copy.searchError(suggestError)} /> : null}
            {suggest.data?.map((s, i) => (
              <Pressable
                key={`${s.eLoc ?? i}-${s.label}`}
                accessibilityRole="button"
                onPress={() => {
                  const address =
                    s.address && !s.address.startsWith(s.label)
                      ? `${s.label}, ${s.address}`
                      : s.address || s.label;
                  const hasCoords = s.lat !== null && s.lng !== null;
                  onChange({
                    ...value,
                    address,
                    eLoc: s.eLoc,
                    lat: s.lat ?? undefined,
                    lng: s.lng ?? undefined,
                  });
                  setNoCoords(!hasCoords);
                  setOpen(false);
                  setQuery('');
                }}
                style={styles.option}
              >
                <Text variant="bodyStrong" numberOfLines={1}>
                  {s.label}
                </Text>
                <Text variant="caption" tone="secondary" numberOfLines={1}>
                  {s.address}
                </Text>
              </Pressable>
            ))}
            {suggest.data && suggest.data.length === 0 && !suggest.isFetching ? (
              <Text variant="caption" tone="secondary" style={styles.pad}>
                No matches.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.status}>
        <MaterialIcons
          name={located ? 'check-circle' : 'my-location'}
          size={16}
          color={located ? colors.verified : locationError ? colors.danger : colors.textSecondary}
        />
        <Text
          variant="caption"
          tone={located ? 'secondary' : locationError ? 'danger' : 'secondary'}
          style={styles.flex}
          testID={`${testID}-location`}
        >
          {located ? copy.located(value.lat!, value.lng!) : noCoords ? copy.noCoords : copy.needLocation}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => setManual((m) => !m)} hitSlop={8}>
          <Text variant="caption" style={styles.link}>
            {manual ? copy.hideManual : copy.manual}
          </Text>
        </Pressable>
      </View>
      {manual ? (
        <TextField
          testID={`${testID}-coords`}
          label={copy.coords}
          value={coordText}
          placeholder={copy.coordsHint}
          onChangeText={(t) => {
            setCoordText(t);
            const p = parseCoords(t);
            if (p) onChange({ ...value, ...p });
          }}
          error={coordText && !parseCoords(coordText) ? copy.coordsInvalid : undefined}
        />
      ) : null}

      <Slider
        testID={`${testID}-radius`}
        label={kind === 'pickup' ? 'Pickup radius' : 'Drop radius'}
        value={value.radiusM}
        min={RADIUS_MIN_M}
        max={RADIUS_MAX_M}
        step={50}
        format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 2 : 0)} km` : `${v} m`)}
        onChange={(radiusM) => onChange({ ...value, radiusM })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dropdown: {
    marginTop: space.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  option: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pad: { padding: space.md },
  status: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  flex: { flex: 1 },
  link: { color: colors.live, textDecorationLine: 'underline' },
});

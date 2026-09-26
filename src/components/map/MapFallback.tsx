import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { colors, radius, space } from '@/theme/tokens';

import type { AppMapProps } from './types';

const fmt = (n: number) => n.toFixed(5);

/**
 * Shown when the Mappls SDK can't load (no key, blocked, offline) or on native before M3.
 * It lists what the map would show, so the screen is still usable.
 */
const FALLBACK = {
  pickup: { icon: 'place', color: colors.verified, label: 'Pickup' },
  drop: { icon: 'flag', color: colors.danger, label: 'Drop' },
  truck: { icon: 'local-shipping', color: colors.accent, label: 'Truck' },
  me: { icon: 'my-location', color: colors.live, label: 'You' },
} as const;

export function MapFallback({
  reason,
  markers = [],
  circles = [],
  polylines = [],
  height = 360,
  testID,
}: AppMapProps & { reason: string }) {
  const planned = polylines.find((p) => p.kind === 'planned');
  return (
    <View style={[styles.box, { minHeight: height }]} testID={testID} accessibilityLabel="Map unavailable">
      <View style={styles.head}>
        <MaterialIcons name="map" size={20} color={colors.textSecondary} />
        <Text variant="bodyStrong" tone="secondary">
          Map unavailable
        </Text>
      </View>
      <Text variant="caption" tone="secondary">
        {reason}
      </Text>
      {markers.map((m) => {
        const circle = circles.find(
          (c) => c.center.lat === m.position.lat && c.center.lng === m.position.lng,
        );
        return (
          <View key={m.id} style={styles.row}>
            <MaterialIcons name={FALLBACK[m.kind].icon} size={18} color={FALLBACK[m.kind].color} />
            <Text variant="caption">
              {FALLBACK[m.kind].label} · {fmt(m.position.lat)}, {fmt(m.position.lng)}
              {circle ? ` · radius ${circle.radiusM} m` : ''}
            </Text>
          </View>
        );
      })}
      {planned ? (
        <Text variant="caption" tone="secondary">
          Planned route: {planned.path.length} points
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.card,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    padding: space.md,
    gap: space.sm,
    justifyContent: 'center',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
});

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
            <MaterialIcons
              name={m.kind === 'pickup' ? 'place' : m.kind === 'drop' ? 'flag' : 'local-shipping'}
              size={18}
              color={
                m.kind === 'pickup' ? colors.verified : m.kind === 'drop' ? colors.danger : colors.accent
              }
            />
            <Text variant="caption">
              {m.kind === 'pickup' ? 'Pickup' : m.kind === 'drop' ? 'Drop' : 'Truck'} · {fmt(m.position.lat)},{' '}
              {fmt(m.position.lng)}
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

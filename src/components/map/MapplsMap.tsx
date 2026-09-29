import { memo, useEffect, useMemo } from 'react';
import { Platform, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import { useTranslation } from 'react-i18next';

import { config } from '@/lib/config';
import { simplifyForDisplay, type LatLng } from '@/lib/simplify';
import { colors } from '@/theme/tokens';

type Marker = LatLng & { id: string; heading?: number | null; label?: string };
type Props = { markers?: Marker[]; points?: LatLng[]; planned?: LatLng[]; compact?: boolean };

type XY = { x: number; y: number };

/**
 * Schematic route preview used by the M11 screens until the real Mappls map
 * components land (M3: MapView.native.tsx / MapView.web.tsx). It projects points onto
 * a plain surface; it is NOT a Mappls map and says so on screen.
 *
 * Performance (M12a): memoised; routes are simplified for display (Douglas–Peucker,
 * ≤ 500 points) because every segment is a native view.
 */
function MapplsMapImpl({ markers = [], points = [], planned = [], compact = false }: Props) {
  const { t } = useTranslation();

  useEffect(() => {
    if (Platform.OS !== 'web' || !config.mapplsMapSdkKey) return;
    const scriptId = 'mappls-web-maps-sdk';
    if (document.getElementById(scriptId)) return;
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `https://apis.mappls.com/advancedmaps/api/${config.mapplsMapSdkKey}/map_sdk?layer=vector&v=3.0`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  const drawnPoints = useMemo(() => simplifyForDisplay(points), [points]);
  const drawnPlanned = useMemo(() => simplifyForDisplay(planned), [planned]);

  const layers = useMemo(() => {
    const all: LatLng[] = [...drawnPlanned, ...drawnPoints, ...markers];
    const lats = all.map((p) => p.lat);
    const lngs = all.map((p) => p.lng);
    const minLat = all.length ? Math.min(...lats) : 12.9;
    const maxLat = all.length ? Math.max(...lats) : 13.05;
    const minLng = all.length ? Math.min(...lngs) : 77.5;
    const maxLng = all.length ? Math.max(...lngs) : 77.8;
    const project = (p: LatLng): XY => ({
      x: ((p.lng - minLng) / Math.max(maxLng - minLng, 0.01)) * 86 + 7,
      y: (1 - (p.lat - minLat) / Math.max(maxLat - minLat, 0.01)) * 78 + 8,
    });
    const segments = (line: LatLng[]) =>
      line
        .slice(0, -1)
        .map((point, index) => segmentStyle(project(point), project(line[index + 1]!)));
    return {
      planned: segments(drawnPlanned),
      tracked: segments(drawnPoints),
      markers: markers.map((marker) => ({ marker, at: project(marker) })),
    };
  }, [drawnPlanned, drawnPoints, markers]);

  return (
    <View
      style={[styles.map, compact && styles.compact]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('map.a11yLabel', { markers: markers.length, points: points.length })}
    >
      <Text style={styles.mapLabel}>{t('map.preview')}</Text>
      {layers.planned.map((style, index) => (
        <View key={`planned-${index}`} style={[styles.route, style]} />
      ))}
      {layers.tracked.map((style, index) => (
        <View key={`tracked-${index}`} style={[styles.tracked, style]} />
      ))}
      {layers.markers.map(({ marker, at }) => (
        <View
          key={marker.id}
          style={[
            styles.marker,
            { left: `${at.x}%` as DimensionValue, top: `${at.y}%` as DimensionValue },
            { transform: [{ rotate: `${marker.heading ?? 0}deg` }] },
          ]}
        >
          <Text style={styles.markerGlyph}>▲</Text>
          {marker.label ? <Text style={styles.markerLabel}>{marker.label}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function segmentStyle(from: XY, to: XY) {
  return {
    left: `${from.x}%` as DimensionValue,
    top: `${from.y}%` as DimensionValue,
    width: `${Math.max(2, Math.hypot(to.x - from.x, to.y - from.y))}%` as DimensionValue,
    transform: [{ rotate: `${Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI)}deg` }],
  };
}

export const MapplsMap = memo(MapplsMapImpl);

const styles = StyleSheet.create({
  map: {
    height: 360,
    minHeight: 260,
    overflow: 'hidden',
    backgroundColor: colors.mapSurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
    marginBottom: 14,
  },
  compact: { height: 180, minHeight: 180, marginBottom: 0 },
  mapLabel: {
    position: 'absolute',
    top: 12,
    left: 14,
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1,
  },
  route: {
    position: 'absolute',
    height: 2,
    borderTopWidth: 2,
    borderColor: colors.plannedRoute,
    borderStyle: 'dashed',
    transformOrigin: 'left center',
  },
  tracked: {
    position: 'absolute',
    height: 5,
    backgroundColor: colors.primary,
    transformOrigin: 'left center',
    borderRadius: 3,
  },
  marker: {
    position: 'absolute',
    marginLeft: -9,
    marginTop: -9,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerGlyph: { color: colors.accent, fontSize: 20, lineHeight: 20 },
  markerLabel: {
    position: 'absolute',
    left: 14,
    top: -8,
    width: 110,
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
});

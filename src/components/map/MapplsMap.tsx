import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View, type DimensionValue } from 'react-native';

import { config } from '@/lib/config';

type Marker = { id: string; lat: number; lng: number; heading?: number | null; label?: string };
type Props = { markers?: Marker[]; points?: { lat: number; lng: number }[]; planned?: { lat: number; lng: number }[]; compact?: boolean };

export function MapplsMap({ markers = [], points = [], planned = [], compact = false }: Props) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !config.mapplsMapSdkKey) return;
    const scriptId = 'mappls-web-maps-sdk';
    const existing = document.getElementById(scriptId);
    if (!existing) { const script = document.createElement('script'); script.id = scriptId; script.src = `https://apis.mappls.com/advancedmaps/api/${config.mapplsMapSdkKey}/map_sdk?layer=vector&v=3.0`; script.async = true; document.head.appendChild(script); }
    return () => undefined;
  }, []);
  const all = [...planned, ...points, ...markers];
  const minLat = all.length ? Math.min(...all.map((p) => p.lat)) : 12.9;
  const maxLat = all.length ? Math.max(...all.map((p) => p.lat)) : 13.05;
  const minLng = all.length ? Math.min(...all.map((p) => p.lng)) : 77.5;
  const maxLng = all.length ? Math.max(...all.map((p) => p.lng)) : 77.8;
  const position = (lat: number, lng: number) => ({ x: ((lng - minLng) / Math.max(maxLng - minLng, 0.01)) * 86 + 7, y: (1 - (lat - minLat) / Math.max(maxLat - minLat, 0.01)) * 78 + 8 });
  const segment = (from: { x: number; y: number }, to: { x: number; y: number }) => ({ left: `${from.x}%` as DimensionValue, top: `${from.y}%` as DimensionValue, width: `${Math.max(2, Math.hypot(to.x - from.x, to.y - from.y))}%` as DimensionValue, transform: [{ rotate: `${Math.atan2(to.y - from.y, to.x - from.x) * 57.3}deg` }] });
  return <View style={[styles.map, compact && styles.compact]}><View style={styles.sdkSurface} /><Text style={styles.mapLabel}>MAPPLS WEB MAP</Text><View style={styles.grid} />{planned.slice(0, -1).map((point, index) => { const next = planned[index + 1]; if (!next) return null; return <View key={`planned-${index}`} style={[styles.route, segment(position(point.lat, point.lng), position(next.lat, next.lng))]} />; })}{points.slice(0, -1).map((point, index) => { const next = points[index + 1]; if (!next) return null; return <View key={`tracked-${index}`} style={[styles.tracked, segment(position(point.lat, point.lng), position(next.lat, next.lng))]} />; })}{markers.map((marker) => { const point = position(marker.lat, marker.lng); return <View key={marker.id} style={[styles.marker, { left: `${point.x}%` as DimensionValue, top: `${point.y}%` as DimensionValue }, { transform: [{ rotate: `${marker.heading ?? 0}deg` }] }]}><Text style={styles.markerGlyph}>▲</Text>{marker.label ? <Text style={styles.markerLabel}>{marker.label}</Text> : null}</View>; })}</View>;
}

const styles = StyleSheet.create({ map: { height: 360, minHeight: 260, overflow: 'hidden', backgroundColor: '#dce9e8', borderRadius: 8, position: 'relative' }, compact: { height: 180, minHeight: 180 }, sdkSurface: { ...StyleSheet.absoluteFill, opacity: 0.08 }, grid: { ...StyleSheet.absoluteFill, opacity: 0.2, backgroundColor: 'transparent', borderWidth: 1, borderColor: '#8eb8b1' }, mapLabel: { position: 'absolute', top: 12, left: 14, color: '#18594f', fontWeight: '700', fontSize: 10, letterSpacing: 1 }, route: { position: 'absolute', height: 2, borderTopWidth: 2, borderColor: '#768792', borderStyle: 'dashed', transformOrigin: 'left center' }, tracked: { position: 'absolute', height: 4, backgroundColor: '#0b7d70', transformOrigin: 'left center', borderRadius: 2 }, marker: { position: 'absolute', marginLeft: -9, marginTop: -9, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }, markerGlyph: { color: '#e56544', fontSize: 20, lineHeight: 20 }, markerLabel: { position: 'absolute', left: 14, top: -8, width: 100, color: '#18343c', fontSize: 11, fontWeight: '700' } });

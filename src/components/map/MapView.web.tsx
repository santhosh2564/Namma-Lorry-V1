// Web map on the Mappls Web SDK v3 (developer.mappls.com → Web JS, V3.0 docs).
// Only Mappls tiles/data are ever shown (CLAUDE.md "Maps: Mappls only").
// API used: new mappls.Map(id, {center, zoom}), map.addListener('load' | 'click'),
// new mappls.Marker({map, position, html, draggable}) + addListener('dragend') + getPosition(),
// new mappls.Circle({map, center, radius, …}), new mappls.Polyline({map, path, …}),
// mappls.remove({map, layer}), mappls.fitBounds({map, cType: 0, bounds: [[lng, lat], …]}).
import { useEffect, useId, useRef } from 'react';
import { View } from 'react-native';

import { config } from '@/lib/config';
import { bounds } from '@/lib/geo';
import { colors, radius } from '@/theme/tokens';

import { MapFallback } from './MapFallback';
import { DEFAULT_CENTER, type AppMapProps, type LatLng } from './types';
import { useMapplsScript } from './useMapplsScript';

// The Mappls SDK ships no TypeScript types, so its objects are typed as any.
type Layer = any;
declare global {
  interface Window {
    mappls?: any;
  }
}

function pinHtml(color: string, rotate = 0) {
  return `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:rotate(${-45 + rotate}deg)"></div>`;
}

const markerColor = {
  pickup: colors.verified,
  drop: colors.danger,
  truck: colors.accent,
  me: colors.live,
} as const;

const dotHtml = (color: string) =>
  `<div style="width:18px;height:18px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 6px ${color}33"></div>`;

function toLatLng(p: any): LatLng | null {
  if (!p) return null;
  const lat = typeof p.lat === 'function' ? p.lat() : p.lat;
  const lng = typeof p.lng === 'function' ? p.lng() : p.lng;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

export function MapView(props: AppMapProps) {
  const status = useMapplsScript(config.EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY);
  if (status === 'no-key') {
    return <MapFallback {...props} reason="Set EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY to show the Mappls map." />;
  }
  if (status === 'error') {
    return <MapFallback {...props} reason="The Mappls map couldn't load (network or key restriction)." />;
  }
  return <MapplsMap {...props} ready={status === 'ready'} />;
}

function MapplsMap({
  center,
  zoom = 6,
  markers = [],
  polylines = [],
  circles = [],
  onPress,
  onMarkerDragEnd,
  fitToContent,
  follow,
  height = 360,
  testID,
  ready,
}: AppMapProps & { ready: boolean }) {
  const id = `mappls-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const map = useRef<any>(null);
  const loaded = useRef(false);
  const layers = useRef<Layer[]>([]);
  const handlers = useRef({ onPress, onMarkerDragEnd });
  handlers.current = { onPress, onMarkerDragEnd };

  // Create the map once the SDK is ready.
  useEffect(() => {
    if (!ready || map.current || !window.mappls) return;
    const m = new window.mappls.Map(id, { center: center ?? DEFAULT_CENTER, zoom });
    map.current = m;
    m.addListener('load', () => {
      loaded.current = true;
      draw();
    });
    m.addListener('click', (e: any) => {
      const p = toLatLng(e?.lngLat);
      if (p) handlers.current.onPress?.(p);
    });
    return () => {
      map.current?.remove?.();
      map.current = null;
      loaded.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id]);

  function clear() {
    for (const layer of layers.current) {
      try {
        if (typeof layer.remove === 'function') layer.remove();
        else window.mappls?.remove({ map: map.current, layer });
      } catch {
        // layer already gone
      }
    }
    layers.current = [];
  }

  function draw() {
    const m = map.current;
    const sdk = window.mappls;
    if (!m || !sdk || !loaded.current) return;
    clear();
    for (const c of circles) {
      layers.current.push(
        new sdk.Circle({
          map: m,
          center: c.center,
          radius: c.radiusM,
          fillColor: colors.accent,
          fillOpacity: 0.18,
          strokeColor: colors.accent,
          strokeOpacity: 0.9,
          strokeWeight: 2,
        }),
      );
    }
    for (const pl of polylines) {
      if (pl.path.length < 2) continue;
      layers.current.push(
        new sdk.Polyline({
          map: m,
          path: pl.path,
          strokeColor: pl.kind === 'planned' ? colors.textSecondary : colors.primary,
          strokeWeight: pl.kind === 'planned' ? 4 : 5,
          ...(pl.kind === 'planned' ? { dasharray: [2, 2] } : {}),
        }),
      );
    }
    for (const mk of markers) {
      const marker = new sdk.Marker({
        map: m,
        position: mk.position,
        html:
          mk.kind === 'me'
            ? dotHtml(markerColor.me)
            : pinHtml(markerColor[mk.kind], mk.kind === 'truck' ? (mk.heading ?? 0) : 0),
        draggable: !!mk.draggable,
      });
      if (mk.draggable) {
        marker.addListener('dragend', () => {
          const p = toLatLng(marker.getPosition());
          if (p) handlers.current.onMarkerDragEnd?.(mk.id, p);
        });
      }
      layers.current.push(marker);
    }
    if (fitToContent) {
      const pts = [...markers.map((x) => x.position), ...polylines.flatMap((x) => x.path)];
      const b = bounds(pts);
      if (b && pts.length > 1) {
        sdk.fitBounds({ map: m, cType: 0, bounds: b, options: { padding: 60, duration: 500 } });
      } else if (pts[0]) {
        m.setCenter(pts[0]);
        m.setZoom(14);
      }
    }
  }

  // D5: pan to the truck whenever it moves (zoom in the first time).
  const followed = useRef(false);
  const fLat = follow?.lat;
  const fLng = follow?.lng;
  useEffect(() => {
    const m = map.current;
    if (fLat === undefined || fLng === undefined || !m || !loaded.current) return;
    m.setCenter({ lat: fLat, lng: fLng });
    if (!followed.current) m.setZoom(15);
    followed.current = true;
  }, [fLat, fLng]);

  // Redraw overlays when they change.
  const signature = JSON.stringify({ markers, polylines, circles });
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (
    <View
      nativeID={id}
      testID={testID}
      accessibilityLabel="Map"
      style={{ height, borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surfaceMuted }}
    />
  );
}

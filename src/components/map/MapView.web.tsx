import { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { boundsCenterZoom, contentBounds } from "./bounds";
import { getMapplsSdk, type MapplsWebLayer, type MapplsWebMap } from "./mappls-web";
import { MAP_STYLE, type AppMapProps, type LatLng, type MapMarker } from "./types";
import { useMapplsScript } from "./useMapplsScript";
import { colors, fonts, radii, spacing } from "@/theme/tokens";

let mapCounter = 0;

function markerColour(kind: MapMarker["kind"]): string {
  if (kind === "pickup") return colors.verified;
  if (kind === "drop") return colors.rejected;
  return colors.accent;
}

function markerIcon(kind: MapMarker["kind"]): string {
  if (kind === "pickup") return "location_on";
  if (kind === "drop") return "flag";
  return "local_shipping";
}

/** Builds the HTML marker Mappls renders inside its own DOM overlay. */
function markerHtml(kind: MapMarker["kind"], heading?: number): string {
  const colour = markerColour(kind);
  const rotate = kind === "truck" && heading != null ? `transform:rotate(${heading}deg);` : "";
  return (
    `<div style="display:flex;align-items:center;justify-content:center;` +
    `width:36px;height:36px;border-radius:${radii.chip}px;background:${colors.surface};` +
    `border:2px solid ${colour};${rotate}">` +
    `<span style="font-family:'${fonts.icon}';font-size:26px;line-height:26px;color:${colour}">` +
    `${markerIcon(kind)}</span></div>`
  );
}

function readLatLng(value: unknown): LatLng | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const lat = candidate.lat ?? candidate.latitude;
  const lng = candidate.lng ?? candidate.longitude;
  return typeof lat === "number" && typeof lng === "number" ? { lat, lng } : null;
}

/** Mappls' click payload shape is undocumented — accept the known variants. */
function parseMapClick(event: unknown): LatLng | null {
  if (!event || typeof event !== "object") return null;
  const payload = event as Record<string, unknown>;
  return (
    readLatLng(payload.lngLat) ??
    readLatLng(payload.latLng) ??
    readLatLng(payload.latlng) ??
    readLatLng(payload)
  );
}

/**
 * Web map built on the Mappls Web Maps JS SDK, loaded once by
 * `useMapplsScript`. Same props as the native implementation.
 */
export function AppMap({
  center,
  zoom,
  markers = [],
  polylines = [],
  circles = [],
  onPress,
  fitToContent = false,
}: AppMapProps) {
  const { status, error } = useMapplsScript();
  const [containerId] = useState(() => `mappls-map-${(mapCounter += 1)}`);

  // Rebuild the Mappls layers whenever the content changes.
  const spec = useMemo(
    () => JSON.stringify({ markers, polylines, circles, center, zoom, fitToContent }),
    [markers, polylines, circles, center, zoom, fitToContent],
  );

  useEffect(() => {
    if (status !== "ready") {
      return;
    }
    const sdk = getMapplsSdk();
    const container = typeof document === "undefined" ? null : document.getElementById(containerId);
    if (!sdk || !container) {
      return;
    }

    const parsed = JSON.parse(spec) as {
      markers: MapMarker[];
      polylines: AppMapProps["polylines"];
      circles: AppMapProps["circles"];
      center?: LatLng;
      zoom?: number;
      fitToContent: boolean;
    };

    const map: MapplsWebMap = new sdk.Map(containerId, {
      center: parsed.center ?? { lat: 20.5937, lng: 78.9629 }, // India fallback
      zoom: parsed.zoom ?? MAP_STYLE.defaultZoom,
      zoomControl: true,
      location: false,
    });
    const layers: MapplsWebLayer[] = [];

    let drawn = false;
    const draw = () => {
      if (drawn) return;
      drawn = true;

      for (const marker of parsed.markers) {
        layers.push(
          new sdk.Marker({
            map,
            position: { lat: marker.position.lat, lng: marker.position.lng },
            html: markerHtml(marker.kind, marker.heading),
            width: 36,
            height: 36,
          }),
        );
      }

      for (const line of parsed.polylines ?? []) {
        const path = line.path.map((point) => ({ lat: point.lat, lng: point.lng }));
        if (line.kind === "planned") {
          // Mappls only documents dashed styling through GeoJSON (`dasharray`).
          sdk.addGeoJson({
            map,
            fitbounds: false,
            dasharray: [...MAP_STYLE.plannedRouteDash],
            data: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  // Mappls GeoJSON coordinates are [lat, lng] (their samples, not GeoJSON spec order).
                  geometry: {
                    type: "LineString",
                    coordinates: line.path.map((point) => [point.lat, point.lng]),
                  },
                },
              ],
            },
          });
        } else {
          layers.push(
            new sdk.Polyline({
              map,
              path,
              strokeColor: colors.primary,
              strokeOpacity: 1,
              strokeWeight: MAP_STYLE.actualRouteWidth,
            }),
          );
        }
      }

      for (const circle of parsed.circles ?? []) {
        layers.push(
          new sdk.Circle({
            map,
            center: { lat: circle.center.lat, lng: circle.center.lng },
            radius: circle.radiusM,
            fillColor: colors.accent,
            fillOpacity: 0.16,
            strokeColor: colors.accent,
            strokeOpacity: 0.8,
            strokeWeight: 2,
          }),
        );
      }

      const bounds = parsed.fitToContent
        ? contentBounds(
            parsed.markers,
            (parsed.polylines ?? []).map((line) => line.path),
            (parsed.circles ?? []).map((circle) => circle.center),
            (parsed.circles ?? []).map((circle) => circle.radiusM),
          )
        : undefined;
      if (bounds) {
        const view = boundsCenterZoom(bounds);
        map.setCenter({ lat: view.center.lat, lng: view.center.lng });
        map.setZoom(view.zoom);
      }
    };

    map.addListener("load", draw);
    // Some builds fire `load` before the listener attaches — draw defensively.
    const fallback = setTimeout(draw, 500);

    const clickListener = onPress
      ? (event: unknown) => {
          const point = parseMapClick(event);
          if (point) onPress(point);
        }
      : null;
    if (clickListener) {
      map.addListener("click", clickListener);
    }

    return () => {
      clearTimeout(fallback);
      for (const layer of layers) {
        try {
          sdk.remove({ map, layer });
        } catch {
          // Best effort — the container is cleared below anyway.
        }
      }
      map.remove?.();
      // Mappls has no documented map.destroy(); clearing the node removes its DOM.
      container.replaceChildren();
    };
  }, [status, containerId, spec, onPress]);

  return (
    <View style={styles.fill}>
      <View nativeID={containerId} style={styles.fill} />
      {status === "error" ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Map unavailable</Text>
          <Text style={styles.overlayBody}>
            {error ?? "The Mappls Web SDK could not load."}
            {"\n"}Add EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY in Settings → Environment and restrict it to
            this domain in the Mappls console.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default AppMap;

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 240 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  overlayTitle: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text },
  overlayBody: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
  },
});

import { useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { contentBounds, type Coord } from "./bounds";
import {
  Camera,
  FillLayer,
  LineLayer,
  MapView as MapplsMapView,
  MarkerView,
  ShapeSource,
  UserLocation,
  UserTrackingMode,
  type MapplsPressFeature,
} from "./mappls-native";
import { MAP_STYLE, type AppMapProps, type LatLng, type MapMarker } from "./types";
import { Icon } from "@/components/ui";
import { circlePolygon } from "@/lib/geo";
import { colors, spacing } from "@/theme/tokens";

/** {lat,lng} → Mappls [lng,lat]. Only map components do this (TRD §5). */
function toCoord(point: LatLng): Coord {
  return [point.lng, point.lat];
}

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

/**
 * Native Mappls GL map (Android + iOS). Requires a development build — the
 * Mappls SDK is native code (see `plugins/withMappls.ts`).
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
  const bounds = useMemo(
    () =>
      contentBounds(
        markers,
        polylines.map((line) => line.path),
        circles.map((circle) => circle.center),
        circles.map((circle) => circle.radiusM),
      ),
    [markers, polylines, circles],
  );

  const actualRoutes = useMemo(
    () =>
      polylines
        .filter((line) => line.kind === "actual")
        .map((line) => ({
          id: line.id,
          shape: {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "LineString" as const,
              coordinates: line.path.map(toCoord),
            },
          },
        })),
    [polylines],
  );

  const plannedRoutes = useMemo(
    () =>
      polylines
        .filter((line) => line.kind === "planned")
        .map((line) => ({
          id: line.id,
          shape: {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "LineString" as const,
              coordinates: line.path.map(toCoord),
            },
          },
        })),
    [polylines],
  );

  const geofences = useMemo(
    () =>
      circles.map((circle) => ({
        id: circle.id,
        shape: {
          type: "Feature" as const,
          properties: {},
          geometry: {
            type: "Polygon" as const,
            coordinates: [circlePolygon(circle.center, circle.radiusM).map(toCoord)],
          },
        },
      })),
    [circles],
  );

  const handlePress = useCallback(
    (feature: MapplsPressFeature) => {
      if (!onPress || feature.geometry?.type !== "Point") {
        return;
      }
      const [lng, lat] = feature.geometry.coordinates;
      if (lng != null && lat != null) {
        onPress({ lat, lng });
      }
    },
    [onPress],
  );

  return (
    <MapplsMapView style={styles.fill} onPress={onPress ? handlePress : undefined}>
      <Camera
        animationDuration={300}
        animationMode="easeTo"
        bounds={fitToContent && bounds ? bounds : undefined}
        centerCoordinate={center ? toCoord(center) : undefined}
        zoomLevel={fitToContent && bounds ? undefined : (zoom ?? MAP_STYLE.defaultZoom)}
      />

      <UserLocation visible trackingMode={UserTrackingMode.None} />

      {actualRoutes.map((route) => (
        <ShapeSource id={route.id} key={route.id} shape={route.shape}>
          <LineLayer
            id={`${route.id}-line`}
            style={{
              lineColor: colors.primary,
              lineWidth: MAP_STYLE.actualRouteWidth,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        </ShapeSource>
      ))}

      {plannedRoutes.map((route) => (
        <ShapeSource id={route.id} key={route.id} shape={route.shape}>
          <LineLayer
            id={`${route.id}-line`}
            style={{
              lineColor: colors.neutral,
              lineWidth: 4,
              lineDasharray: MAP_STYLE.plannedRouteDash,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        </ShapeSource>
      ))}

      {geofences.map((geofence) => (
        <ShapeSource id={geofence.id} key={geofence.id} shape={geofence.shape}>
          <FillLayer
            id={`${geofence.id}-fill`}
            style={{
              fillColor: colors.accent,
              fillOpacity: 0.16,
              fillOutlineColor: colors.accent,
            }}
          />
        </ShapeSource>
      ))}

      {markers.map((marker) => (
        <MarkerView coordinate={toCoord(marker.position)} key={marker.id}>
          <View
            style={[
              styles.marker,
              { borderColor: markerColour(marker.kind) },
              marker.kind === "truck" && marker.heading != null
                ? { transform: [{ rotate: `${marker.heading}deg` }] }
                : null,
            ]}
          >
            <Icon
              accessibilityLabel={marker.kind}
              color={markerColour(marker.kind)}
              name={markerIcon(marker.kind)}
              size={26}
            />
          </View>
        </MarkerView>
      ))}
    </MapplsMapView>
  );
}

export default AppMap;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  marker: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: 999,
    borderWidth: 2,
    height: 36,
    justifyContent: "center",
    width: 36,
    marginBottom: spacing.sm,
  },
});

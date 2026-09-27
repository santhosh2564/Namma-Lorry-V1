import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { AppMap } from "@/components/map";
import type { LatLng, MapPolyline } from "@/components/map";
import { Banner, Button, Card, SectionHeader, StatBlock } from "@/components/ui";
import { config } from "@/lib/config";
import { bearing, haversineMetres } from "@/lib/geo";
import { colors, fonts, fontSize, radii, spacing } from "@/theme/tokens";

/**
 * Dev-only map spike (M3). Shows a pickup geofence, a drop pin, a dashed
 * planned route, the actual driven route and a rotated truck marker, plus
 * "fit to content". Runs the same code on native (Mappls GL, via a development
 * build) and web (Mappls Web Maps JS SDK).
 *
 * Sample data is Load NL-2026-000142 (stitch/DESIGN.md): Sriperumbudur SIPCOT →
 * Coimbatore Kurichi Industrial Estate.
 */

const SRI_PERUMBUDUR: LatLng = { lat: 12.9698, lng: 79.9382 };
const COIMBATORE: LatLng = { lat: 10.9878, lng: 76.9558 };

/** Planned highway route (approx. NH-44/NH-544 corridor). */
const PLANNED_ROUTE: LatLng[] = [
  SRI_PERUMBUDUR,
  { lat: 12.74, lng: 79.62 },
  { lat: 12.52, lng: 78.8 },
  { lat: 12.13, lng: 78.16 },
  { lat: 11.66, lng: 78.14 },
  { lat: 11.34, lng: 77.72 },
  { lat: 11.1, lng: 77.1 },
  COIMBATORE,
];

/** Actual route so far — the first half of the plan, with GPS-sized wobble. */
const ACTUAL_ROUTE: LatLng[] = [
  SRI_PERUMBUDUR,
  { lat: 12.7392, lng: 79.6151 },
  { lat: 12.5241, lng: 78.8114 },
  { lat: 12.1428, lng: 78.1572 },
];

const TRUCK_POSITION: LatLng = { lat: 11.6641, lng: 78.1462 };
const TRUCK_HEADING = bearing(ACTUAL_ROUTE[ACTUAL_ROUTE.length - 2]!, TRUCK_POSITION);

function routeLengthKm(path: LatLng[]): number {
  let metres = 0;
  for (let i = 1; i < path.length; i += 1) {
    metres += haversineMetres(path[i - 1]!, path[i]!);
  }
  return metres / 1000;
}

export default function DevMap() {
  const [fitToContent, setFitToContent] = useState(true);
  const [tapped, setTapped] = useState<LatLng | null>(null);

  const polylines = useMemo<MapPolyline[]>(
    () => [
      { id: "planned-route", kind: "planned", path: PLANNED_ROUTE },
      { id: "actual-route", kind: "actual", path: ACTUAL_ROUTE },
    ],
    [],
  );

  const circles = useMemo(
    () => [
      { id: "pickup-geofence", center: SRI_PERUMBUDUR, radiusM: 500 },
      { id: "drop-geofence", center: COIMBATORE, radiusM: 500 },
    ],
    [],
  );

  const markers = useMemo(() => {
    const base = [
      { id: "pickup", kind: "pickup" as const, position: SRI_PERUMBUDUR },
      { id: "drop", kind: "drop" as const, position: COIMBATORE },
      { id: "truck", kind: "truck" as const, position: TRUCK_POSITION, heading: TRUCK_HEADING },
    ];
    return tapped ? [...base, { id: "tapped", kind: "drop" as const, position: tapped }] : base;
  }, [tapped]);

  const handlePress = useCallback((point: LatLng) => setTapped(point), []);

  const approxDrivenKm = routeLengthKm(ACTUAL_ROUTE);
  const approxPlannedKm = routeLengthKm(PLANNED_ROUTE);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>Map spike</Text>
        <Text style={styles.pageHint}>M3 · Mappls · same props on native and web</Text>
      </View>

      {config.mapplsMapSdkKey.length === 0 ? (
        <Banner
          message="EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY is not set. Web needs it to load the Mappls SDK; native uses the Mappls config files added by plugins/withMappls.ts."
          variant="warning"
        />
      ) : null}

      <View style={styles.mapFrame}>
        <AppMap
          circles={circles}
          fitToContent={fitToContent}
          markers={markers}
          onPress={handlePress}
          polylines={polylines}
        />
      </View>

      <View style={styles.actions}>
        <Button
          fullWidth
          label={fitToContent ? "Fit to content: on" : "Fit to content: off"}
          onPress={() => setFitToContent((value) => !value)}
          size="lg"
          variant={fitToContent ? "primary" : "outline"}
        />
        <Button
          fullWidth
          label="Clear tapped pin"
          onPress={() => setTapped(null)}
          size="lg"
          variant="outline"
        />
      </View>

      <Card>
        <View style={styles.stats}>
          <StatBlock
            caption="approx."
            label="Driven"
            size="sm"
            value={`${approxDrivenKm.toFixed(1)} km`}
          />
          <StatBlock
            caption="approx."
            label="Planned"
            size="sm"
            value={`${approxPlannedKm.toFixed(0)} km`}
          />
          <StatBlock label="Truck heading" size="sm" value={`${Math.round(TRUCK_HEADING)}°`} />
        </View>
      </Card>

      <View style={styles.section}>
        <SectionHeader title="Legend" />
        <Text style={styles.legend}>Navy solid line — actual route (from the GPS queue)</Text>
        <Text style={styles.legend}>Grey dashed line — planned route</Text>
        <Text style={styles.legend}>Amber circle — pickup/drop geofence (500 m)</Text>
        <Text style={styles.legend}>Amber lorry — truck marker, rotated by heading</Text>
        <Text style={styles.legend}>
          {tapped
            ? `Last tap: ${tapped.lat.toFixed(5)}, ${tapped.lng.toFixed(5)}`
            : "Tap the map to drop a pin (onPress converts [lng,lat] → {lat,lng})"}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: spacing.md,
    gap: spacing.lg,
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
  },
  header: { gap: spacing.xs },
  pageTitle: { fontFamily: fonts.semibold, fontSize: fontSize.heading, color: colors.text },
  pageHint: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
  mapFrame: {
    borderColor: colors.border,
    borderRadius: radii.card,
    borderWidth: 1,
    height: 420,
    overflow: "hidden",
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xl },
  section: { gap: spacing.xs },
  legend: { fontFamily: fonts.regular, fontSize: fontSize.caption, color: colors.textSecondary },
});

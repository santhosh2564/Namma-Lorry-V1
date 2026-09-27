/**
 * Shared map contract (docs/03-TRD.md §5).
 *
 * One interface, two implementations — `MapView.native.tsx` (Mappls GL for
 * React Native) and `MapView.web.tsx` (Mappls Web Maps JS SDK). Screens import
 * `@/components/map/MapView` and never touch a Mappls-only type.
 *
 * Coordinate order: this app uses `{ lat, lng }`; Mappls native and the web SDK
 * use `[lng, lat]`. Conversion happens only inside the map components.
 */
export type LatLng = { lat: number; lng: number };

export interface AppMapProps {
  center?: LatLng;
  zoom?: number;
  markers?: { id: string; position: LatLng; kind: "truck" | "pickup" | "drop"; heading?: number }[];
  polylines?: { id: string; path: LatLng[]; kind: "actual" | "planned" }[];
  circles?: { id: string; center: LatLng; radiusM: number }[]; // geofences
  onPress?: (p: LatLng) => void;
  fitToContent?: boolean;
}

export type MapMarker = NonNullable<AppMapProps["markers"]>[number];
export type MapPolyline = NonNullable<AppMapProps["polylines"]>[number];
export type MapCircle = NonNullable<AppMapProps["circles"]>[number];

/** Map style / palette shared by both platforms (stitch/DESIGN.md). */
export const MAP_STYLE = {
  actualRouteWidth: 5,
  plannedRouteDash: [2, 2] as number[],
  /** Default zoom when no `center`/`zoom` is supplied. */
  defaultZoom: 12,
} as const;

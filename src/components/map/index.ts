/**
 * Map abstraction (M3). Screens import from here — `MapView` resolves to
 * `MapView.native.tsx` (Mappls GL) or `MapView.web.tsx` (Mappls Web SDK) per
 * platform.
 */
export { AppMap } from "./MapView";
export type { AppMapProps, LatLng, MapCircle, MapMarker, MapPolyline } from "./types";
export { MAP_STYLE } from "./types";

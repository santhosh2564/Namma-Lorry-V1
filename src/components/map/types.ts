// Map abstraction (TRD §5). Screens import only '@/components/map/MapView'.
import type { LatLng } from '@/lib/geo';

export type { LatLng };

export interface MapMarker {
  id: string;
  position: LatLng;
  /** `me`: the driver's own position (blue dot, D4). */
  kind: 'truck' | 'pickup' | 'drop' | 'me';
  heading?: number;
  /** Extension to TRD §5: lets the admin drag a pin to refine a location (C3). */
  draggable?: boolean;
}

export interface MapPolyline {
  id: string;
  path: LatLng[];
  kind: 'actual' | 'planned';
}

export interface MapCircle {
  id: string;
  center: LatLng;
  radiusM: number;
}

export interface AppMapProps {
  center?: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  polylines?: MapPolyline[];
  circles?: MapCircle[];
  onPress?: (p: LatLng) => void;
  /** Extension to TRD §5: fired when a draggable marker is dropped. */
  onMarkerDragEnd?: (id: string, p: LatLng) => void;
  fitToContent?: boolean;
  /** Height of the map area in px (default 360). */
  height?: number;
  testID?: string;
}

/** India-wide default view. */
export const DEFAULT_CENTER: LatLng = { lat: 12.97, lng: 78.5 };

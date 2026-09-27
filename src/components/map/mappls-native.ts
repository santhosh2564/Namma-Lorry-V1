/**
 * Typed access to `mappls-map-react-native` (native only, M3).
 *
 * Why a `require` instead of an `import`: the package ships TypeScript source
 * (`main: ./src/index.ts`) written against React Native 0.79 typings, which no
 * longer type-check on React Native 0.86 (refs, `Text` styles, pointer types).
 * Importing it would drag that source into `tsc` and fail the build for
 * dependency reasons we do not control. `require` keeps Metro bundling the real
 * package while `tsc` only sees the interface below.
 *
 * The declared surface is exactly what `MapView.native.tsx` uses
 * (docs/03-TRD.md §5). Extend it as later milestones add components.
 */
import type { ReactElement, ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";

/** Mappls coordinate order. */
export type MapplsCoord = number[];

export type MapplsGeoJson = Record<string, unknown>;

/** Minimal GeoJSON feature shape returned by map press events. */
export type MapplsPressFeature = {
  type: string;
  geometry?: { type: string; coordinates: number[] } | null;
  properties?: unknown;
};

export type CameraPadding = {
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
};

export type CameraBounds = { ne: MapplsCoord; sw: MapplsCoord } & CameraPadding;

export type CameraAnimationMode = "flyTo" | "easeTo" | "linearTo" | "moveTo";

export type LineLayerStyle = {
  lineColor?: string;
  lineWidth?: number;
  lineOpacity?: number;
  lineDasharray?: number[];
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "bevel" | "round" | "miter";
};

export type FillLayerStyle = {
  fillColor?: string;
  fillOpacity?: number;
  fillOutlineColor?: string;
  fillAntialias?: boolean;
};

export type CircleLayerStyle = {
  circleColor?: string;
  circleOpacity?: number;
  circleRadius?: number;
  circleStrokeColor?: string;
  circleStrokeWidth?: number;
};

export interface MapplsNativeSdk {
  MapView: (props: {
    style?: StyleProp<ViewStyle>;
    onPress?: (feature: MapplsPressFeature) => void;
    onLongPress?: (feature: MapplsPressFeature) => void;
    children?: ReactNode;
  }) => ReactElement | null;
  Camera: (props: {
    centerCoordinate?: MapplsCoord;
    zoomLevel?: number;
    bounds?: CameraBounds;
    animationMode?: CameraAnimationMode;
    animationDuration?: number;
    defaultSettings?: Record<string, unknown>;
    children?: ReactNode;
  }) => ReactElement | null;
  UserLocation: (props: {
    visible?: boolean;
    trackingMode?: number | string;
    showsUserHeadingIndicator?: boolean;
  }) => ReactElement | null;
  UserTrackingMode: Record<string, number | string> & {
    None: number | string;
    Follow: number | string;
    FollowWithHeading: number | string;
  };
  ShapeSource: (props: {
    id: string;
    shape: MapplsGeoJson | string;
    cluster?: boolean;
    onPress?: (event: unknown) => void;
    children?: ReactNode;
  }) => ReactElement | null;
  LineLayer: (props: {
    id: string;
    style?: LineLayerStyle;
    aboveLayerID?: string;
    belowLayerID?: string;
    children?: ReactNode;
  }) => ReactElement | null;
  FillLayer: (props: {
    id: string;
    style?: FillLayerStyle;
    aboveLayerID?: string;
    belowLayerID?: string;
    children?: ReactNode;
  }) => ReactElement | null;
  CircleLayer: (props: {
    id: string;
    style?: CircleLayerStyle;
    aboveLayerID?: string;
    belowLayerID?: string;
    children?: ReactNode;
  }) => ReactElement | null;
  MarkerView: (props: {
    coordinate: MapplsCoord;
    anchor?: { x: number; y: number };
    children: ReactElement;
  }) => ReactElement | null;
  PointAnnotation: (props: {
    id: string;
    coordinate?: MapplsCoord;
    title?: string;
    anchor?: { x: number; y: number };
    children?: ReactElement;
  }) => ReactElement | null;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MapplsNative = require("mappls-map-react-native") as MapplsNativeSdk;

export const {
  MapView,
  Camera,
  UserLocation,
  UserTrackingMode,
  ShapeSource,
  LineLayer,
  FillLayer,
  CircleLayer,
  MarkerView,
  PointAnnotation,
} = MapplsNative;

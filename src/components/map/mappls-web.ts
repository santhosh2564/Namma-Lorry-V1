/**
 * Mappls Web Maps JS SDK loader (web only, M3).
 *
 * The SDK is a browser global (`mappls`) loaded from the CDN — there is no npm
 * package in our dependency tree, so we script-load it exactly once and reuse
 * the same promise. Only `MapView.web.tsx` / `useMapplsScript` import this file,
 * so the SDK never enters the native bundle.
 *
 * Docs: https://developer.mappls.com/documentation/sdk/Web/Web%20JS/
 * Verified against docs/V3.0 (mapMethods, markers, polyline, circle, geoJson).
 */

const SCRIPT_ID = "mappls-web-sdk";
const SDK_URL = "https://sdk.mappls.com/map/sdk/web";

export type MapplsWebLatLng = { lat: number; lng: number };

export interface MapplsWebMap {
  addListener(event: string, handler: (event: unknown) => void): void;
  setCenter(center: MapplsWebLatLng): void;
  setZoom(zoom: number): void;
  remove?(): void;
}

// Opaque handles returned by Marker / Polyline / Circle.
export type MapplsWebLayer = Record<string, unknown>;

export type MapplsWebMapOptions = {
  center?: MapplsWebLatLng;
  zoom?: number;
  zoomControl?: boolean;
  location?: boolean;
  [key: string]: unknown;
};

export type MapplsWebMarkerOptions = {
  map: MapplsWebMap;
  position: MapplsWebLatLng;
  html?: string;
  width?: number;
  height?: number;
  offset?: [number, number];
  [key: string]: unknown;
};

export type MapplsWebPolylineOptions = {
  map: MapplsWebMap;
  path: MapplsWebLatLng[];
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  [key: string]: unknown;
};

export type MapplsWebCircleOptions = {
  map: MapplsWebMap;
  center: MapplsWebLatLng;
  radius: number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeWeight?: number;
  [key: string]: unknown;
};

export type MapplsWebGeoJsonOptions = {
  map: MapplsWebMap;
  data: Record<string, unknown>;
  /** Mappls GeoJSON arrays are `[lat, lng]` (non-standard — see the SDK samples). */
  fitbounds?: boolean;
  dasharray?: number[];
  cType?: number;
  [key: string]: unknown;
};

export interface MapplsWebSdk {
  Map: new (container: string | HTMLElement, options: MapplsWebMapOptions) => MapplsWebMap;
  Marker: new (options: MapplsWebMarkerOptions) => MapplsWebLayer;
  Polyline: new (options: MapplsWebPolylineOptions) => MapplsWebLayer;
  Circle: new (options: MapplsWebCircleOptions) => MapplsWebLayer;
  addGeoJson(options: MapplsWebGeoJsonOptions): void;
  remove(options: { map: MapplsWebMap; layer: MapplsWebLayer }): void;
}

type MapplsGlobalWindow = Window & { mappls?: MapplsWebSdk };

function getWindow(): MapplsGlobalWindow | undefined {
  return typeof window === "undefined" ? undefined : (window as MapplsGlobalWindow);
}

/** The already-loaded SDK, or `undefined` before the script has run. */
export function getMapplsSdk(): MapplsWebSdk | undefined {
  return getWindow()?.mappls;
}

let loadPromise: Promise<MapplsWebSdk> | null = null;

/**
 * Loads the Mappls Web Maps SDK once and resolves with the global. Subsequent
 * calls reuse the same promise, so the script tag never appears twice.
 */
export function loadMapplsSdk(accessToken: string): Promise<MapplsWebSdk> {
  const existing = getMapplsSdk();
  if (existing) {
    return Promise.resolve(existing);
  }

  const browserWindow = getWindow();
  if (!browserWindow || !browserWindow.document) {
    return Promise.reject(new Error("Mappls Web SDK can only load in a browser"));
  }
  if (!accessToken) {
    return Promise.reject(new Error("EXPO_PUBLIC_MAPPLS_MAP_SDK_KEY is not set"));
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise<MapplsWebSdk>((resolve, reject) => {
    const fail = () => {
      loadPromise = null;
      reject(new Error("Failed to load the Mappls Web Maps SDK"));
    };

    const previous = browserWindow.document.getElementById(SCRIPT_ID);
    if (previous) {
      previous.addEventListener("load", () => {
        const sdk = getMapplsSdk();
        if (sdk) {
          resolve(sdk);
        } else {
          fail();
        }
      });
      previous.addEventListener("error", fail);
      return;
    }

    const script = browserWindow.document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `${SDK_URL}?v=3.0&access_token=${encodeURIComponent(accessToken)}`;
    script.addEventListener("load", () => {
      const sdk = getMapplsSdk();
      if (sdk) {
        resolve(sdk);
      } else {
        fail();
      }
    });
    script.addEventListener("error", fail);
    browserWindow.document.head.appendChild(script);
  });

  return loadPromise;
}

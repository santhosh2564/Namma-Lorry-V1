// Typed string catalog. Screens read `t.section.key` (a string) or call `t.section.fn(...)`.
// Every string leaf is a getter over en.json paths, so it always returns the current language.
// Functions below add formatting (numbers, distances, plurals) on top of the JSON templates.
import { useSyncExternalStore } from 'react';

import en from './en.json';
import { getLanguage, subscribeLanguage, tr, type Language } from './i18n';

export * from './i18n';

/** 420 → "420 m", 1830 → "1.8 km", 396_400 → "396 km" */
const fmtKm = (m: number) => {
  if (m < 1000) return `${Math.round(m)} m`;
  const tenths = Math.round(m / 100) / 10;
  return `${tenths >= 10 ? Math.round(m / 1000) : tenths.toFixed(1)} km`;
};

/** Reason text with the metric when known (docs/08 §3). */
const reason =
  (code: string, param: string, fmt: (v: number) => string | number = (v) => v) =>
  (v: number | null) =>
    v !== null ? tr(`reasons.${code}_value`, { [param]: fmt(v) }) : tr(`reasons.${code}`);

const fns = {
  a11y: {
    sortBy: (column: string) => tr('a11y.sortBy', { column }),
    accountMenu: (name: string) => tr('a11y.accountMenu', { name }),
    decrease: (label: string) => tr('a11y.decrease', { label }),
    increase: (label: string) => tr('a11y.increase', { label }),
    navBadge: (label: string, count: string) => tr('a11y.navBadge', { label, count }),
  },
  language: { current: (language: string) => tr('language.current', { language }) },
  errors: {
    OUTSIDE_PICKUP: (distanceM: number) => tr('errors.OUTSIDE_PICKUP', { distance: fmtKm(distanceM) }),
  },
  map: {
    plannedPoints: (count: number) => tr('map.plannedPoints', { count }),
    radius: (m: number) => tr('map.radius', { m }),
  },
  verify: {
    sentTo: (phone: string) => tr('verify.sentTo', { phone }),
    resendIn: (time: string) => tr('verify.resendIn', { time }),
  },
  permissions: { readyCount: (n: number) => tr('permissions.readyCount', { n }) },
  battery: { detected: (brand: string) => tr('battery.detected', { brand }) },
  trips: {
    greeting: (name: string) => tr('trips.greeting', { name }),
    elapsed: (duration: string) => tr('trips.elapsed', { duration }),
    pendingPoints: (count: number) => tr('trips.pendingPoints', { count }),
  },
  tripDetail: {
    weakGps: (m: number) => tr('tripDetail.weakGps', { m }),
    outside: (distance: string) => tr('tripDetail.outside', { distance }),
    ready: (m: number) => tr('tripDetail.ready', { m }),
  },
  activeTrip: {
    to: (place: string) => tr('activeTrip.to', { place }),
    waiting: (count: number) => tr('activeTrip.waiting', { count }),
    offline: (count: number) =>
      count > 0 ? tr('activeTrip.offline', { count }) : tr('activeTrip.offlineNoPoints'),
    gpsGood: (m: number | null) =>
      m === null ? tr('activeTrip.gpsGood') : tr('activeTrip.gpsGoodAccuracy', { m }),
    gpsWeak: (m: number) => tr('activeTrip.gpsWeak', { m }),
    problem: { 'no-points': (min: number) => tr('activeTrip.problem.no-points', { min }) },
  },
  endSheet: { outside: (distance: string) => tr('endSheet.outside', { distance }) },
  summary: {
    offlinePending: (count: number) => tr('summary.offlinePending', { count }),
    total: (count: number, km: string) => tr('summary.total', { count, km }),
    reviewNote: (note: string) => tr('summary.reviewNote', { note }),
  },
  // Driver-facing text per verify_trip reason code (docs/08 §3). `v` is the metric, when known.
  reasons: {
    START_OUTSIDE_PICKUP: reason('START_OUTSIDE_PICKUP', 'distance', fmtKm),
    END_OUTSIDE_DROP: reason('END_OUTSIDE_DROP', 'distance', fmtKm),
    MOCK_LOCATION: (_v?: number | null) => tr('reasons.MOCK_LOCATION'),
    TRACKING_GAP: reason('TRACKING_GAP', 'min'),
    LOW_COVERAGE: (_v?: number | null) => tr('reasons.LOW_COVERAGE'),
    MISSING_POINTS: (_v?: number | null) => tr('reasons.MISSING_POINTS'),
    SPEED_IMPLAUSIBLE: reason('SPEED_IMPLAUSIBLE', 'kmh'),
    GPS_JUMPS: reason('GPS_JUMPS', 'n'),
    DISTANCE_TOO_SHORT: reason('DISTANCE_TOO_SHORT', 'pct'),
    DISTANCE_TOO_LONG: reason('DISTANCE_TOO_LONG', 'pct'),
    OTHER: (_v?: number | null) => tr('reasons.OTHER'),
  },
  history: {
    summary: (verified: number, review: number) => tr('history.summary', { verified, review }),
    monthCount: (count: number) => tr('history.monthCount', { count }),
  },
  profile: {
    since: (month: string) => tr('profile.since', { month }),
    version: (version: string) => tr('profile.version', { version }),
  },
  console: {
    pager: {
      range: (from: number, to: number, total: number) => tr('console.pager.range', { from, to, total }),
      page: (page: number, count: number) => tr('console.pager.page', { page, count }),
    },
    age: {
      s: (n: number) => tr('console.age.s', { n }),
      min: (n: number) => tr('console.age.min', { n }),
      h: (n: number) => tr('console.age.h', { n }),
      d: (n: number) => tr('console.age.d', { n }),
    },
    events: { expectedPoints: (count: number) => tr('console.events.expectedPoints', { count }) },
    place: {
      located: (lat: number, lng: number) =>
        tr('console.place.located', { lat: lat.toFixed(5), lng: lng.toFixed(5) }),
    },
    live: { activeTrips: (count: number) => tr('console.live.activeTrips', { count }) },
    tripDetail: {
      lastUpdate: (age: string) => tr('console.tripDetail.lastUpdate', { age }),
      replayAt: (time: string, i: number, n: number) => tr('console.tripDetail.replayAt', { time, i, n }),
      verifiedBySystem: (km: string) => tr('console.tripDetail.verifiedBySystem', { km }),
      approvedBy: (who: string, note: string) => tr('console.tripDetail.approvedBy', { who, note }),
      rejectedBy: (who: string, note: string) => tr('console.tripDetail.rejectedBy', { who, note }),
    },
    reviewQueue: {
      title: (count: number) => tr('console.reviewQueue.title', { count }),
      ended: (age: string) => tr('console.reviewQueue.ended', { age }),
    },
    searchResults: (query: string) => tr('console.searchResults', { query }),
    drivers: { added: (name: string, phone: string) => tr('console.drivers.added', { name, phone }) },
    createLoad: { planned: (km: string, eta: string) => tr('console.createLoad.planned', { km, eta }) },
    loadDetail: {
      verifiedStats: (trips: number, km: string) => tr('console.loadDetail.verifiedStats', { trips, km }),
      busyWarning: (name: string) => tr('console.loadDetail.busyWarning', { name }),
      assigned: (when: string) => tr('console.loadDetail.assigned', { when }),
    },
    vehicles: {
      form: { regPreview: (reg: string) => tr('console.vehicles.form.regPreview', { reg }) },
      added: (reg: string) => tr('console.vehicles.added', { reg }),
    },
  },
};

// ---- typed live view over en.json + fns ----

type Fn = (...args: never[]) => unknown;
type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? B[K] extends Fn
      ? B[K]
      : K extends keyof A
        ? Merge<A[K], B[K]>
        : B[K]
    : K extends keyof A
      ? A[K] extends readonly (infer E)[]
        ? readonly E[]
        : A[K] extends object
          ? Merge<A[K], unknown>
          : string
      : never;
};

export type Strings = Merge<typeof en, typeof fns>;

type Node = { [k: string]: unknown };

function build(json: unknown, over: unknown, path: string): unknown {
  if (typeof json === 'string') return undefined; // handled by the parent's getter
  const target: Node | unknown[] = Array.isArray(json) ? [] : {};
  const src = json as Node;
  const o = (over ?? {}) as Node;
  for (const key of new Set([...Object.keys(src ?? {}), ...Object.keys(o)])) {
    const p = path ? `${path}.${key}` : key;
    if (typeof o[key] === 'function') {
      Object.defineProperty(target, key, { value: o[key], enumerable: true });
    } else if (typeof src[key] === 'string') {
      Object.defineProperty(target, key, { get: () => tr(p), enumerable: true });
    } else if (src[key] !== undefined) {
      Object.defineProperty(target, key, { value: build(src[key], o[key], p), enumerable: true });
    }
  }
  return target;
}

/** The app's strings in the current language. */
export const t = build(en, fns, '') as Strings;

/** Looks up a code in a string map (e.g. `t.console.tripDetail.errors`), with a fallback. */
export function pick(map: object, code: string | null | undefined, fallback: string): string {
  const v = code ? (map as Record<string, unknown>)[code] : undefined;
  return typeof v === 'string' ? v : fallback;
}

/**
 * Re-renders the calling component when the language changes. Every route component calls it,
 * so strings read from `t` during render pick up the new language without a remount.
 */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribeLanguage, getLanguage, getLanguage);
}

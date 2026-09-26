import { destination } from '@/lib/geo';

import {
  approxDistanceM,
  currentPosition,
  dropInfo,
  gpsStatus,
  isTrackingProblem,
  STALE_POINT_MS,
  syncStatus,
  type GpsInput,
  type TrackPoint,
} from './liveModel';

const O = { lat: 12.9563, lng: 79.9422 };
const NOW = 1_800_000_000_000;
const pt = (east: number, ageMs = 0, accuracy: number | null = 8): TrackPoint => ({
  ...destination(O, 90, east),
  accuracy,
  recordedAt: NOW - ageMs,
});

describe('approxDistanceM', () => {
  it('sums haversine segments', () => {
    expect(approxDistanceM([pt(0), pt(1000), pt(2500)])).toBeCloseTo(2500, 0);
    expect(approxDistanceM([])).toBe(0);
    expect(approxDistanceM([pt(0)])).toBe(0);
  });
  it('skips points worse than 50 m accuracy (like verify_trip) without breaking the line', () => {
    expect(approxDistanceM([pt(0), pt(5000, 0, 200), pt(1000)])).toBeCloseTo(1000, 0);
    expect(approxDistanceM([pt(0), pt(1000, 0, null)])).toBeCloseTo(1000, 0);
  });
});

describe('syncStatus', () => {
  it('synced / waiting / offline', () => {
    expect(syncStatus(0, true)).toEqual({ kind: 'synced' });
    expect(syncStatus(12, true)).toEqual({ kind: 'waiting', pending: 12 });
    expect(syncStatus(12, false)).toEqual({ kind: 'offline', pending: 12 });
    expect(syncStatus(0, false)).toEqual({ kind: 'offline', pending: 0 });
  });
});

describe('gpsStatus', () => {
  const base: GpsInput = {
    now: NOW,
    startedAt: NOW - 10 * 60_000,
    lastPoint: pt(0, 5_000),
    permissionOk: true,
    servicesEnabled: true,
    taskRunning: true,
    currentFix: null,
  };
  const g = (p: Partial<GpsInput>) => gpsStatus({ ...base, ...p });

  it('good and weak from the last recorded point', () => {
    expect(g({})).toEqual({ kind: 'good', accuracyM: 8 });
    expect(g({ lastPoint: pt(0, 5_000, 72.4) })).toEqual({ kind: 'weak', accuracyM: 72 });
  });

  it('waiting right after start with no point yet', () => {
    expect(g({ lastPoint: null, startedAt: NOW - 30_000 })).toEqual({ kind: 'waiting' });
  });

  it('no point for > 2 min is a problem', () => {
    const s = g({ lastPoint: pt(0, STALE_POINT_MS + 1) });
    expect(s.kind).toBe('no-points');
    expect(isTrackingProblem(s)).toBe(true);
    expect(g({ lastPoint: null, startedAt: NOW - 3 * 60_000 }).kind).toBe('no-points');
    expect(g({ lastPoint: pt(0, STALE_POINT_MS) }).kind).toBe('good');
  });

  it('but a fresh fix next to the last point means stopped, not broken', () => {
    const stale = pt(0, 5 * 60_000);
    expect(g({ lastPoint: stale, currentFix: pt(30, 2_000) })).toEqual({ kind: 'stopped' });
    expect(isTrackingProblem({ kind: 'stopped' })).toBe(false);
    // moved 400 m with nothing recorded → broken
    expect(g({ lastPoint: stale, currentFix: pt(400, 2_000) }).kind).toBe('no-points');
    // the fix itself is old → can't tell → problem
    expect(g({ lastPoint: stale, currentFix: pt(10, 60_000) }).kind).toBe('no-points');
  });

  it('permission, GPS off and task not running come first', () => {
    expect(g({ permissionOk: false }).kind).toBe('permission');
    expect(g({ servicesEnabled: false }).kind).toBe('gps-off');
    expect(g({ taskRunning: false }).kind).toBe('not-running');
    expect(g({ taskRunning: null }).kind).toBe('good');
    for (const k of ['permission', 'gps-off', 'not-running'] as const)
      expect(isTrackingProblem({ kind: k })).toBe(true);
  });
});

describe('currentPosition', () => {
  it('prefers the newer of a fresh fix and the last point', () => {
    const last = pt(0, 20_000);
    const fix = pt(100, 1_000);
    expect(currentPosition(last, fix, NOW)).toBe(fix);
    expect(currentPosition(pt(0, 500), fix, NOW)).toEqual(pt(0, 500));
    expect(currentPosition(last, pt(100, 60_000), NOW)).toBe(last); // stale fix ignored
    expect(currentPosition(null, fix, NOW)).toBe(fix);
    expect(currentPosition(null, null, NOW)).toBeNull();
  });
});

describe('dropInfo', () => {
  it('inside the drop radius + accuracy (verify_trip END_OUTSIDE_DROP rule)', () => {
    expect(dropInfo(pt(450), O, 500)?.inside).toBe(true);
    expect(dropInfo(pt(540, 0, 50), O, 500)?.inside).toBe(true);
    const far = dropInfo(pt(1800), O, 500)!;
    expect(far.inside).toBe(false);
    expect(Math.round(far.distanceM)).toBe(1800);
    expect(dropInfo(null, O, 500)).toBeNull();
  });
});

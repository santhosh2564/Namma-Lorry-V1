import { destination } from '@/lib/geo';

import { canStart, FIX_MAX_AGE_MS, formatShortDistance, startState, type StartInput } from './startState';

const pickup = { lat: 12.9563, lng: 79.9422 };
const NOW = 1_800_000_000_000;
const at = (distanceM: number, accuracy: number | null = 8, ageMs = 0) => {
  const p = destination(pickup, 90, distanceM);
  return { lat: p.lat, lng: p.lng, accuracy, timestamp: NOW - ageMs };
};
const input = (p: Partial<StartInput>): StartInput => ({
  tripStatus: 'assigned',
  pickup,
  pickupRadiusM: 500,
  fix: at(100),
  permissionsOk: true,
  starting: false,
  now: NOW,
  ...p,
});

describe('D4 startState', () => {
  it('ready inside the radius with good accuracy', () => {
    const s = startState(input({}));
    expect(s).toMatchObject({ kind: 'ready', accuracyM: 8 });
    expect(canStart(s)).toBe(true);
  });

  it('waiting for GPS with no fix or a stale one', () => {
    expect(startState(input({ fix: null })).kind).toBe('waiting-gps');
    expect(startState(input({ fix: at(100, 8, FIX_MAX_AGE_MS + 1) })).kind).toBe('waiting-gps');
    expect(startState(input({ fix: at(100, 8, FIX_MAX_AGE_MS) })).kind).toBe('ready');
  });

  it('weak GPS above 50 m accuracy (server rejects it too)', () => {
    expect(startState(input({ fix: at(100, 51) }))).toEqual({ kind: 'weak-gps', accuracyM: 51 });
    expect(startState(input({ fix: at(100, null) })).kind).toBe('weak-gps');
    expect(startState(input({ fix: at(100, 50) })).kind).toBe('ready');
  });

  it('outside the radius shows the distance and cannot start', () => {
    const s = startState(input({ fix: at(3200) }));
    expect(s.kind).toBe('outside');
    expect(canStart(s)).toBe(false);
    if (s.kind === 'outside') expect(Math.round(s.distanceM)).toBe(3200);
  });

  it('uses radius + accuracy like start_trip', () => {
    expect(startState(input({ fix: at(530, 40) })).kind).toBe('ready');
    expect(startState(input({ fix: at(545, 40) })).kind).toBe('outside');
  });

  it('starting wins over GPS state; permission comes before GPS', () => {
    expect(startState(input({ starting: true, fix: null })).kind).toBe('starting');
    expect(startState(input({ permissionsOk: false })).kind).toBe('permission');
    expect(canStart(startState(input({ starting: true })))).toBe(false);
  });

  it('trip status gates everything', () => {
    expect(startState(input({ tripStatus: 'in_progress' })).kind).toBe('in-progress');
    for (const st of ['completed', 'verified', 'needs_review', 'rejected', 'cancelled']) {
      expect(startState(input({ tripStatus: st })).kind).toBe('not-startable');
    }
  });
});

describe('formatShortDistance', () => {
  it.each([
    [4, '10 m'],
    [648, '650 m'],
    [994, '990 m'],
    [999, '1.0 km'],
    [3240, '3.2 km'],
    [9_990, '10 km'],
    [41_000, '41 km'],
  ])('%d → %s', (m, text) => expect(formatShortDistance(m)).toBe(text));
});

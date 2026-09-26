import { t } from '@/i18n/en';

import { isFinalStatus, REASON_CODES, reasonViews, summaryState } from './summaryModel';

describe('summaryState', () => {
  it.each([
    [{ state: 'ENDED_PENDING_SYNC', pending: 5 }, 'in_progress', { kind: 'ended-offline', pending: 5 }],
    [{ state: 'ENDING', pending: 0 }, null, { kind: 'ended-offline', pending: 0 }],
    [{ state: 'TRACKING', pending: 0 }, 'in_progress', { kind: 'in-progress' }],
    [{ state: 'ENDED', pending: 0 }, 'completed', { kind: 'verifying' }],
    [{ state: 'ENDED', pending: 0 }, 'in_progress', { kind: 'verifying' }],
    [{ state: 'ENDED', pending: 0 }, null, { kind: 'verifying' }],
    [null, 'completed', { kind: 'verifying' }],
    [null, 'verified', { kind: 'verified' }],
    [null, 'needs_review', { kind: 'needs-review' }],
    [null, 'rejected', { kind: 'rejected' }],
    [null, 'cancelled', { kind: 'cancelled' }],
    // local copy cleaned up after the sync, server row not refetched yet: never bounce to D5
    [null, 'in_progress', { kind: 'verifying' }],
    [null, null, { kind: 'unknown' }],
    // the server already has the result while the phone still shows the pending end
    [{ state: 'ENDED_PENDING_SYNC', pending: 0 }, 'needs_review', { kind: 'needs-review' }],
    [{ state: 'ENDING', pending: 3 }, 'verified', { kind: 'verified' }],
    [null, 'assigned', { kind: 'unknown' }],
  ] as const)('local %j + server %s → %j', (local, serverStatus, expected) => {
    expect(summaryState({ local, serverStatus })).toEqual(expected);
  });

  it('final statuses stop polling', () => {
    expect(['verified', 'needs_review', 'rejected', 'cancelled'].every(isFinalStatus)).toBe(true);
    expect([null, undefined, 'completed', 'in_progress'].some(isFinalStatus)).toBe(false);
  });
});

describe('reasonViews', () => {
  it('maps every docs/08 §3 code to its own text key', () => {
    const views = reasonViews(REASON_CODES, {});
    expect(views.map((v) => v.key)).toEqual(REASON_CODES);
    for (const code of REASON_CODES) {
      expect(typeof t.reasons[code]).toBe('function');
      expect(t.reasons[code](null).length).toBeGreaterThan(10);
    }
  });

  it('uses the docs/08 driver-facing wording', () => {
    expect(t.reasons.END_OUTSIDE_DROP(null)).toBe("Trip didn't end at the delivery location");
    expect(t.reasons.MOCK_LOCATION()).toBe('Fake GPS app detected');
    expect(t.reasons.MISSING_POINTS()).toBe('Some trip data never uploaded');
  });

  it('adds details from verification_metrics', () => {
    const m = {
      end_distance_m: 1830,
      start_distance_m: 420,
      max_gap_s: 1500,
      avg_kmh: 92.5,
      jumps: 9,
      planned_ratio: 0.62,
    };
    const text = (code: string) => {
      const v = reasonViews([code], m)[0]!;
      return t.reasons[v.key](v.value);
    };
    expect(text('END_OUTSIDE_DROP')).toBe("Trip didn't end at the delivery location (1.8 km away)");
    expect(text('START_OUTSIDE_PICKUP')).toBe("Trip didn't start at the pickup location (420 m away)");
    expect(t.reasons.END_OUTSIDE_DROP(396_400)).toBe(
      "Trip didn't end at the delivery location (396 km away)",
    );
    expect(text('TRACKING_GAP')).toBe('Tracking stopped for a long time (25 min)');
    expect(text('SPEED_IMPLAUSIBLE')).toBe('Trip speed looks unusual (92.5 km/h average)');
    expect(text('GPS_JUMPS')).toBe('GPS signal jumped around (9 times)');
    expect(text('DISTANCE_TOO_SHORT')).toBe(
      'Distance is much shorter than the route (62% of the planned km)',
    );
  });

  it('tolerates unknown codes, null metrics and null lists', () => {
    expect(reasonViews(['NEW_RULE'], null)).toEqual([{ code: 'NEW_RULE', key: 'OTHER', value: null }]);
    expect(reasonViews(['END_OUTSIDE_DROP'], { end_distance_m: null })[0]!.value).toBeNull();
    expect(reasonViews(null, null)).toEqual([]);
  });
});

import {
  ageText,
  applyLiveChange,
  filterLiveRows,
  istMidnightIso,
  kpis,
  liveRows,
  STALE_MS,
  type LiveSource,
} from './liveBoard';

const NOW = Date.parse('2026-09-26T10:00:00.000Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const trip = (id: string, liveAgoMs: number | null, startedAgoMs = 3_600_000): LiveSource => ({
  id,
  started_at: ago(startedAgoMs),
  driver: { full_name: `Driver ${id}` },
  vehicle: { registration_no: `TN 23 BK 45${id}` },
  load: {
    load_code: `NL-2026-0001${id}`,
    pickup_address: 'Sriperumbudur, TN',
    drop_address: 'Coimbatore, TN',
  },
  live: liveAgoMs === null ? null : { lat: 12.9, lng: 79.9, heading: 90, recorded_at: ago(liveAgoMs) },
});

describe('liveRows', () => {
  it('computes age, stale (> 15 min) and route; stale first, then freshest', () => {
    const rows = liveRows([trip('1', 40_000), trip('2', 18 * 60_000), trip('3', 5_000)], NOW);
    expect(rows.map((r) => r.tripId)).toEqual(['2', '3', '1']);
    expect(rows[0]).toMatchObject({ stale: true, ageMs: 18 * 60_000, route: 'Sriperumbudur → Coimbatore' });
    expect(rows[2]).toMatchObject({
      stale: false,
      ageMs: 40_000,
      heading: 90,
      position: { lat: 12.9, lng: 79.9 },
    });
  });

  it('boundary: exactly 15 min is not stale', () => {
    expect(liveRows([trip('1', STALE_MS)], NOW)[0]!.stale).toBe(false);
    expect(liveRows([trip('1', STALE_MS + 1)], NOW)[0]!.stale).toBe(true);
  });

  it('no point yet: no position, stale once the start is > 15 min ago', () => {
    expect(liveRows([trip('1', null, 60_000)], NOW)[0]).toMatchObject({
      position: null,
      ageMs: null,
      stale: false,
    });
    expect(liveRows([trip('1', null, 20 * 60_000)], NOW)[0]!.stale).toBe(true);
  });
});

describe('ageText', () => {
  it.each([
    [null, 'No data yet'],
    [40_000, '40 s ago'],
    [18 * 60_000, '18 min ago'],
    [2 * 3_600_000, '2 h ago'],
    [72 * 3_600_000, '3 d ago'],
  ])('%s → %s', (ms, text) => expect(ageText(ms)).toBe(text));
});

describe('filterLiveRows and kpis', () => {
  const rows = liveRows([trip('1', 40_000), trip('2', 18 * 60_000)], NOW);
  it('matches vehicle, driver, load code ignoring spaces and case', () => {
    expect(filterLiveRows(rows, 'tn23bk451').map((r) => r.tripId)).toEqual(['1']);
    expect(filterLiveRows(rows, 'driver 2').map((r) => r.tripId)).toEqual(['2']);
    expect(filterLiveRows(rows, 'nl-2026-00012').map((r) => r.tripId)).toEqual(['2']);
    expect(filterLiveRows(rows, '  ')).toHaveLength(2);
  });
  it('counts live and stale', () => {
    expect(kpis(rows, 12, 3)).toEqual({ live: 2, stale: 1, assignedToday: 12, needReview: 3 });
  });
});

describe('istMidnightIso', () => {
  it('is 18:30 UTC of the previous UTC day', () => {
    expect(istMidnightIso(Date.parse('2026-09-26T10:00:00Z'))).toBe('2026-09-25T18:30:00.000Z');
    expect(istMidnightIso(Date.parse('2026-09-26T19:00:00Z'))).toBe('2026-09-26T18:30:00.000Z');
  });
});

describe('applyLiveChange', () => {
  const trips = [trip('1', 60_000), trip('2', null)];
  const change = (eventType: 'INSERT' | 'UPDATE' | 'DELETE', n: Record<string, unknown>) => ({
    eventType,
    new: n,
  });

  it('updates the matching trip position', () => {
    const next = applyLiveChange(
      trips,
      change('UPDATE', { trip_id: '1', lat: 13, lng: 80, heading: 45, recorded_at: ago(1_000) }),
    )!;
    expect(next[0]!.live).toMatchObject({ lat: 13, lng: 80, heading: 45, recorded_at: ago(1_000) });
    expect(next[1]).toBe(trips[1]);
  });

  it('first point for a trip (INSERT) fills its live position', () => {
    const next = applyLiveChange(
      trips,
      change('INSERT', { trip_id: '2', lat: 1, lng: 2, heading: null, recorded_at: ago(0) }),
    )!;
    expect(next[1]!.live).toMatchObject({ lat: 1, lng: 2, heading: null });
  });

  it('ignores an older (out-of-order) update', () => {
    expect(
      applyLiveChange(trips, change('UPDATE', { trip_id: '1', lat: 0, lng: 0, recorded_at: ago(120_000) })),
    ).toBe(trips);
  });

  it('unknown trip or DELETE (trip ended) → null, meaning refetch', () => {
    expect(
      applyLiveChange(trips, change('UPDATE', { trip_id: 'x', lat: 0, lng: 0, recorded_at: ago(0) })),
    ).toBeNull();
    expect(applyLiveChange(trips, change('DELETE', {}))).toBeNull();
  });
});

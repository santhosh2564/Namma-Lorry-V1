import {
  dayMonthIST,
  groupByMonth,
  historyCounts,
  historyStatus,
  matchesFilter,
  type HistoryTrip,
} from './history';

const trip = (id: string, status: string, ended: string | null, km = 100): HistoryTrip => ({
  id,
  status,
  started_at: ended,
  ended_at: ended,
  created_at: '2026-08-01T00:00:00Z',
  tracked_distance_m: km * 1000,
});

describe('historyStatus and filters', () => {
  it('maps server statuses to driver-facing ones', () => {
    expect(['verified', 'needs_review', 'rejected', 'completed', 'cancelled'].map(historyStatus)).toEqual([
      'verified',
      'review',
      'rejected',
      'verifying',
      'cancelled',
    ]);
  });
  it('filters and counts', () => {
    const trips = [
      trip('a', 'verified', null),
      trip('b', 'needs_review', null),
      trip('c', 'verified', null),
      trip('d', 'completed', null),
    ];
    expect(historyCounts(trips)).toEqual({ all: 4, verified: 2, review: 1, rejected: 0 });
    expect(trips.filter((t) => matchesFilter(t, 'verified')).map((t) => t.id)).toEqual(['a', 'c']);
    expect(trips.filter((t) => matchesFilter(t, 'all'))).toHaveLength(4);
  });
});

describe('groupByMonth', () => {
  it('groups newest first by IST month, summing verified km only', () => {
    const groups = groupByMonth([
      trip('aug', 'verified', '2026-08-20T06:00:00Z', 50),
      trip('sep1', 'verified', '2026-09-26T06:00:00Z', 512),
      trip('sep2', 'needs_review', '2026-09-22T06:00:00Z', 125),
      // 30 Sep 20:00 UTC is 1 Oct 01:30 IST
      trip('oct', 'verified', '2026-09-30T20:00:00Z', 10),
    ]);
    expect(groups.map((g) => [g.title, g.trips.map((t) => t.id), g.distanceM])).toEqual([
      ['October 2026', ['oct'], 10_000],
      ['September 2026', ['sep1', 'sep2'], 512_000],
      ['August 2026', ['aug'], 50_000],
    ]);
  });
  it('falls back to the assigned date when a trip never started', () => {
    expect(groupByMonth([trip('x', 'cancelled', null)])[0]!.title).toBe('August 2026');
  });
});

describe('dayMonthIST', () => {
  it('formats in IST', () => {
    expect(dayMonthIST('2026-09-26T06:00:00Z')).toBe('26 Sep');
    expect(dayMonthIST('2026-09-30T20:00:00Z')).toBe('1 Oct');
  });
});

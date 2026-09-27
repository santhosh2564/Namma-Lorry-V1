import { fetchAllPoints, type RoutePoint } from './api';
import {
  appendLivePoint,
  formatDateTimeIST,
  metricItems,
  nextReplayIndex,
  replayStep,
  timelineItems,
} from './tripDetail';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const pt = (seq: number, iso: string): RoutePoint => ({
  seq,
  lat: 12,
  lng: 79,
  recorded_at: iso,
  heading: null,
  speed_mps: null,
  accuracy_m: 8,
  is_mocked: false,
});

describe('fetchAllPoints (1000 per page)', () => {
  it('reads pages until a short page and asks for the right ranges', async () => {
    const ranges: [number, number][] = [];
    const total = 2345;
    const all = await fetchAllPoints(async (from, to) => {
      ranges.push([from, to]);
      const n = Math.max(0, Math.min(to, total - 1) - from + 1);
      return {
        data: Array.from({ length: n }, (_, k) => pt(from + k + 1, '2026-09-26T00:00:00Z')),
        error: null,
      };
    });
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(all).toHaveLength(total);
    expect(all.at(-1)!.seq).toBe(total);
  });

  it('an exact multiple needs one extra (empty) page', async () => {
    let calls = 0;
    const all = await fetchAllPoints(async (from) => {
      calls += 1;
      return {
        data: from < 2000 ? Array.from({ length: 1000 }, (_, k) => pt(from + k + 1, 'x')) : [],
        error: null,
      };
    });
    expect(all).toHaveLength(2000);
    expect(calls).toBe(3);
  });

  it('throws the page error', async () => {
    await expect(fetchAllPoints(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow(
      'boom',
    );
  });
});

describe('replay', () => {
  it('steps so a replay takes ~300 ticks and stops at the end', () => {
    expect(replayStep(10)).toBe(1);
    expect(replayStep(3000)).toBe(10);
    expect(nextReplayIndex(0, 10)).toBe(1);
    expect(nextReplayIndex(2995, 3000)).toBe(2999);
    expect(nextReplayIndex(2999, 3000)).toBe(2999);
    expect(nextReplayIndex(0, 0)).toBe(0);
  });
});

describe('appendLivePoint', () => {
  const pts = [pt(1, '2026-09-26T06:00:00Z'), pt(2, '2026-09-26T06:00:10Z')];
  it('appends a newer live position with a provisional seq', () => {
    const next = appendLivePoint(pts, { lat: 13, lng: 80, heading: 90, recorded_at: '2026-09-26T06:00:20Z' });
    expect(next).toHaveLength(3);
    expect(next[2]).toMatchObject({ seq: 3, lat: 13, heading: 90 });
  });
  it('ignores a position that is not newer', () => {
    expect(appendLivePoint(pts, { lat: 0, lng: 0, recorded_at: '2026-09-26T06:00:10Z' })).toBe(pts);
  });
  it('works on an empty route', () => {
    expect(appendLivePoint([], { lat: 1, lng: 2, recorded_at: '2026-09-26T06:00:00Z' })[0]!.seq).toBe(1);
  });
});

describe('metricItems', () => {
  it('formats the verify_trip metrics', () => {
    const items = metricItems(
      {
        points: 3412,
        max_gap_s: 240,
        avg_kmh: 52.1,
        planned_ratio: 0.97,
        mocked: 0,
        jumps: 1,
        end_distance_m: 1830,
      },
      512_345,
      3412,
    );
    const byKey = Object.fromEntries(items.map((i) => [i.key, i.value]));
    expect(byKey).toMatchObject({
      tracked: '512.3 km',
      points: '3,412 / 3,412',
      max_gap: '4 min',
      avg_kmh: '52.1 km/h',
      planned_ratio: '0.97',
      mocked: '0',
      end_d: '1.8 km',
    });
    expect(byKey.start_d).toBeUndefined();
    expect(
      metricItems({ start_distance_m: 84, end_distance_m: 396_574 }, null, null).map((i) => i.value),
    ).toEqual(['84 m', '397 km']);
  });
  it('handles missing metrics', () => {
    expect(metricItems(null, null, null)).toEqual([]);
    expect(metricItems({ max_gap_s: 42 }, null, null)[0]!.value).toBe('42 s');
  });
});

describe('timeline', () => {
  it('labels events in IST with details', () => {
    const items = timelineItems(
      [
        { id: 1, type: 'started', payload: null, created_at: '2026-09-26T00:40:00Z' },
        { id: 2, type: 'ended', payload: { expected_points: 3412 }, created_at: '2026-09-26T10:22:00Z' },
        {
          id: 3,
          type: 'needs_review',
          payload: { reasons: ['END_OUTSIDE_DROP'] },
          created_at: '2026-09-26T10:23:00Z',
        },
        {
          id: 4,
          type: 'approved',
          payload: { note: 'Checked with shipper' },
          created_at: '2026-09-26T11:00:00Z',
        },
        { id: 5, type: 'something_new', payload: null, created_at: '2026-09-26T11:00:00Z' },
      ],
      'Namma Lorry Ops',
    );
    expect(items.map((i) => [i.label, i.time, i.detail])).toEqual([
      ['Started', '26 Sep 06:10', null],
      ['Ended', '26 Sep 15:52', '3412 points expected'],
      ['Flagged for review', '26 Sep 15:53', 'END_OUTSIDE_DROP'],
      ['Approved', '26 Sep 16:30', 'Namma Lorry Ops: Checked with shipper'],
      ['something_new', '26 Sep 16:30', null],
    ]);
  });
  it('formats across midnight IST', () => {
    expect(formatDateTimeIST('2026-09-26T19:05:00Z')).toBe('27 Sep 00:35');
  });
});

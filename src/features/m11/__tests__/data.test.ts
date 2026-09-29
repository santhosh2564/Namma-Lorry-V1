/**
 * Regression tests for the M12a fix: failed or empty queries must never be replaced
 * by demo data (they previously returned invented trips/drivers).
 */
import {
  fetchLiveTrips,
  fetchTrip,
  fetchTripPoints,
  fetchTrips,
  mergePoints,
  reviewTrip,
} from '../data';

const mockResult: { data: unknown; error: unknown } = { data: [], error: null };

function mockBuilder() {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'order', 'eq', 'range']) chain[method] = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(() => Promise.resolve(mockResult));
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(mockResult).then(resolve, reject);
  return chain;
}

const mockRpc = jest.fn(() => Promise.resolve({ error: null }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => mockBuilder()),
    rpc: (...args: unknown[]) => mockRpc(...(args as [])),
  },
}));

beforeEach(() => {
  mockResult.data = [];
  mockResult.error = null;
  mockRpc.mockClear();
});

describe('m11 data layer', () => {
  it('returns an empty list — not demo trips — when the driver has no trips', async () => {
    await expect(fetchTrips()).resolves.toEqual([]);
    await expect(fetchLiveTrips()).resolves.toEqual([]);
  });

  it('throws query errors so screens can show an error state', async () => {
    mockResult.error = { message: 'TypeError: Failed to fetch', code: '' };
    mockResult.data = null;
    await expect(fetchTrips('needs_review')).rejects.toMatchObject({
      message: 'TypeError: Failed to fetch',
    });
    await expect(fetchTrip('t1')).rejects.toBeTruthy();
    await expect(fetchTripPoints('t1')).rejects.toBeTruthy(); // never a silently partial route
  });

  it('returns null for an unknown trip instead of a demo trip', async () => {
    mockResult.data = null;
    await expect(fetchTrip('missing')).resolves.toBeNull();
  });

  it('blocks an empty review note before calling the RPC', async () => {
    await expect(reviewTrip('t1', true, '   ')).rejects.toThrow('NOTE_REQUIRED');
    expect(mockRpc).not.toHaveBeenCalled();
    await reviewTrip('t1', false, ' Checked with shipper ');
    expect(mockRpc).toHaveBeenCalledWith('admin_review_trip', {
      p_trip_id: 't1',
      p_approve: false,
      p_note: 'Checked with shipper',
    });
  });

  it('merges realtime points by seq without duplicates', () => {
    const p = (seq: number) => ({
      trip_id: 't',
      seq,
      recorded_at: '',
      lat: 0,
      lng: 0,
      accuracy_m: null,
      speed_mps: null,
      heading: null,
    });
    expect(mergePoints([p(1), p(2)], [p(2), p(4), p(3)]).map((x) => x.seq)).toEqual([1, 2, 3, 4]);
  });
});

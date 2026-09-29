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
  subscribe,
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

type Handler = (payload: Record<string, unknown>) => void;
type FakeChannel = { handlers: Record<string, Handler>; status?: (status: string) => void };
const mockChannels: FakeChannel[] = [];
const mockRemoveChannel = jest.fn(() => Promise.resolve('ok'));
function mockChannel() {
  const record: FakeChannel = { handlers: {} };
  mockChannels.push(record);
  const api = {
    on: (type: string, _filter: unknown, cb: Handler) => {
      record.handlers[type] = cb;
      return api;
    },
    subscribe: (cb: (status: string) => void) => {
      record.status = cb;
      return api;
    },
  };
  return api;
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => mockChannel()),
    removeChannel: (...args: unknown[]) => mockRemoveChannel(...(args as [])),
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

  describe('subscribe (realtime)', () => {
    beforeEach(() => {
      mockChannels.length = 0;
      mockRemoveChannel.mockClear();
    });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('refetches only once postgres_changes are actually being captured (M12b fix)', () => {
      const onReconnect = jest.fn();
      subscribe('trip_live', undefined, jest.fn(), onReconnect);
      const ch = mockChannels[0]!;
      ch.status!('SUBSCRIBED');
      expect(onReconnect).not.toHaveBeenCalled(); // changes in this window are not delivered
      ch.handlers.system!({
        extension: 'postgres_changes',
        status: 'ok',
        message: 'Subscribed to PostgreSQL',
      });
      expect(onReconnect).toHaveBeenCalledTimes(1);
    });

    it('passes new rows to onChange', () => {
      const onChange = jest.fn();
      subscribe('trip_points', 'trip_id=eq.t1', onChange);
      mockChannels[0]!.handlers.postgres_changes!({ new: { seq: 7 } });
      expect(onChange).toHaveBeenCalledWith({ seq: 7 });
    });

    it.each(['CHANNEL_ERROR', 'TIMED_OUT'])('resubscribes on %s', async (status) => {
      subscribe('trips', 'id=eq.t1', jest.fn());
      mockChannels[0]!.status!(status);
      await flush();
      expect(mockRemoveChannel).toHaveBeenCalledTimes(1);
      expect(mockChannels).toHaveLength(2);
    });

    it('resubscribes when the server reports a postgres_changes error', async () => {
      subscribe('trips', undefined, jest.fn());
      mockChannels[0]!.handlers.system!({
        extension: 'postgres_changes',
        status: 'error',
        message: 'boom',
      });
      await flush();
      expect(mockChannels).toHaveLength(2);
    });

    it('does not reconnect on CLOSED (removeChannel itself emits it) or after unsubscribe', async () => {
      const stop = subscribe('trips', undefined, jest.fn());
      mockChannels[0]!.status!('CLOSED');
      stop();
      mockChannels[0]!.status!('CHANNEL_ERROR');
      await flush();
      expect(mockChannels).toHaveLength(1);
    });
  });
});

import { act, renderHook } from '@testing-library/react-native';

import { retryDelay, useRealtimeChanges, type ChangePayload } from './useRealtimeChanges';

jest.mock('./supabase', () => ({ supabase: {} }));
let mockNetListener: ((s: { isConnected: boolean; isInternetReachable: boolean }) => void) | null = null;
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: (cb: typeof mockNetListener) => {
      mockNetListener = cb;
      return () => (mockNetListener = null);
    },
  },
}));

interface FakeChannel {
  name: string;
  handlers: { filter: unknown; cb: (p: ChangePayload) => void }[];
  status?: (s: string) => void;
  removed: boolean;
}

function fakeClient() {
  const channels: FakeChannel[] = [];
  const client = {
    channel(name: string) {
      const ch: FakeChannel = { name, handlers: [], removed: false };
      channels.push(ch);
      const api = {
        on(_type: string, filter: unknown, cb: (p: ChangePayload) => void) {
          ch.handlers.push({ filter, cb });
          return api;
        },
        subscribe(cb: (s: string) => void) {
          ch.status = cb;
          return api;
        },
        __ch: ch,
      };
      return api;
    },
    async removeChannel(api: { __ch: FakeChannel }) {
      api.__ch.removed = true;
      return 'ok';
    },
  };
  return { client: client as never, channels };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('retryDelay', () => {
  it('doubles from 1 s and caps at 30 s', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(retryDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });
});

describe('useRealtimeChanges', () => {
  function setup() {
    const f = fakeClient();
    const onChange = jest.fn();
    const onResync = jest.fn();
    const hook = renderHook(() =>
      useRealtimeChanges({
        name: 'test',
        changes: [{ table: 'trip_live' }, { table: 'trips', event: 'UPDATE', filter: 'id=eq.1' }],
        onChange,
        onResync,
        client: f.client,
      }),
    );
    return { ...f, onChange, onResync, hook };
  }

  it('subscribes to every table spec and resyncs once subscribed', async () => {
    const { channels, onResync, hook } = setup();
    const h = await hook;
    expect(channels).toHaveLength(1);
    expect(channels[0]!.handlers.map((x) => x.filter)).toEqual([
      { event: '*', schema: 'public', table: 'trip_live', filter: undefined },
      { event: 'UPDATE', schema: 'public', table: 'trips', filter: 'id=eq.1' },
    ]);
    expect(h.result.current).toBe('connecting');
    await act(async () => channels[0]!.status!('SUBSCRIBED'));
    expect(onResync).toHaveBeenCalledTimes(1);
    expect(h.result.current).toBe('live');
  });

  it('passes change payloads through', async () => {
    const { channels, onChange, hook } = setup();
    await hook;
    const p = { table: 'trip_live', eventType: 'UPDATE', new: { trip_id: 't' }, old: {} } as ChangePayload;
    await act(async () => channels[0]!.handlers[0]!.cb(p));
    expect(onChange).toHaveBeenCalledWith(p);
  });

  it('on a channel error: retries with backoff on a fresh channel, then resyncs again', async () => {
    const { channels, onResync, hook } = setup();
    const h = await hook;
    await act(async () => channels[0]!.status!('SUBSCRIBED'));
    await act(async () => channels[0]!.status!('CHANNEL_ERROR'));
    expect(h.result.current).toBe('retrying');
    expect(channels).toHaveLength(1);
    await act(async () => jest.advanceTimersByTime(999));
    expect(channels).toHaveLength(1);
    await act(async () => jest.advanceTimersByTime(1));
    expect(channels).toHaveLength(2);
    expect(channels[0]!.removed).toBe(true);
    await act(async () => channels[1]!.status!('SUBSCRIBED'));
    expect(onResync).toHaveBeenCalledTimes(2);
    expect(h.result.current).toBe('live');
  });

  it('a late status from an old channel is ignored', async () => {
    const { channels, onResync, hook } = setup();
    await hook;
    await act(async () => channels[0]!.status!('TIMED_OUT'));
    await act(async () => jest.advanceTimersByTime(1000));
    await act(async () => channels[0]!.status!('SUBSCRIBED'));
    expect(onResync).not.toHaveBeenCalled();
  });

  it('network back → resubscribes immediately', async () => {
    const { channels, hook } = setup();
    await hook;
    await act(async () => mockNetListener!({ isConnected: false, isInternetReachable: false }));
    await act(async () => mockNetListener!({ isConnected: true, isInternetReachable: true }));
    expect(channels).toHaveLength(2);
    expect(channels[0]!.removed).toBe(true);
  });

  it('unmount removes the channel and stops retrying', async () => {
    const { channels, hook } = setup();
    const h = await hook;
    await act(async () => channels[0]!.status!('CHANNEL_ERROR'));
    await h.unmount();
    await act(async () => jest.advanceTimersByTime(60_000));
    expect(channels).toHaveLength(1);
    expect(channels[0]!.removed).toBe(true);
  });
});

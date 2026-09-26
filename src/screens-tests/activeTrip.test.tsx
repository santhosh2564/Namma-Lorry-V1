// RNTL: D5 Active Trip sync / GPS / problem / near-drop states and the End flow.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { BackHandler } from 'react-native';

import type { PermissionSnapshot } from '@/features/onboarding/permissionModel';
import { destination } from '@/lib/geo';
import type { LiveSnapshot } from '@/tracking/liveTrip';

import ActiveTrip from '../../app/driver/trips/[id]/live';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 't1' }),
  useRouter: () => ({ replace: mockReplace, push: mockPush }),
  Redirect: ({ href }: { href: string }) => {
    mockReplace(`redirect:${href}`);
    return null;
  },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/useRoutingDecision', () => ({ localTripQueryKey: ['tracking', 'local-state'] }));
jest.mock('@/components/map/MapView', () => ({ MapView: () => null }));
jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn(async () => undefined),
  deactivateKeepAwake: jest.fn(async () => undefined),
}));
jest.mock('@/features/trips/keepAwakePref', () => ({
  getKeepAwake: async () => false,
  setKeepAwake: jest.fn(async () => undefined),
}));

const DROP = { lat: 12.9165, lng: 79.1325 };
jest.mock('@/features/trips/api', () => ({
  ...jest.requireActual('@/features/trips/api'),
  useMyTrip: () => ({
    data: {
      id: 't1',
      status: 'in_progress',
      started_at: null,
      load: {
        load_code: 'NL-2026-000142',
        drop_address: 'Kurichi Industrial Estate, Coimbatore',
        drop_lat: 12.9165,
        drop_lng: 79.1325,
        drop_radius_m: 500,
      },
    },
  }),
}));

const mockNet = { isConnected: true, isInternetReachable: true as boolean | null };
jest.mock('@react-native-community/netinfo', () => ({ useNetInfo: () => mockNet }));

const mockPerms: { current: PermissionSnapshot } = { current: {} as PermissionSnapshot };
jest.mock('@/tracking/permissions', () => ({
  permissionsQueryKey: ['tracking', 'permissions'],
  readPermissions: async () => mockPerms.current,
  openLocationServicesSettings: jest.fn(async () => undefined),
}));

const mockLive: { current: LiveSnapshot } = { current: {} as LiveSnapshot };
const mockRestart = jest.fn(async () => undefined);
jest.mock('@/tracking/liveTrip', () => ({
  liveTripKey: (id: string) => ['tracking', 'live', id],
  getLiveSnapshot: async () => mockLive.current,
  restartTracking: () => mockRestart(),
}));

let mockEmit: ((f: { lat: number; lng: number; accuracy: number | null; timestamp: number }) => void) | null =
  null;
jest.mock('@/tracking/foregroundLocation', () => ({
  watchForegroundFix: (cb: typeof mockEmit) => {
    mockEmit = cb;
    return () => (mockEmit = null);
  },
}));
const mockEndTrip = jest.fn();
jest.mock('@/tracking/runtime', () => ({ getTracking: async () => ({ engine: { endTrip: mockEndTrip } }) }));

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
/** A point `distM` metres east of the drop, recorded `msAgo` ago. */
function point(seq: number, distM: number, msAgo: number, accuracy = 8) {
  const p = destination(DROP, 90, distM);
  return { seq, recorded_at: iso(msAgo), lat: p.lat, lng: p.lng, accuracy_m: accuracy, heading: 90 };
}
function snapshot(over: Partial<LiveSnapshot> = {}): LiveSnapshot {
  return {
    state: {
      trip_id: 't1',
      state: 'TRACKING',
      next_seq: 3,
      started_at: iso(65 * 60_000),
      ended_at: null,
      end_lat: null,
      end_lng: null,
      end_accuracy: null,
      last_seq: null,
      server_status: null,
      last_error: null,
      updated_at: iso(0),
    },
    route: [point(1, 12_000, 60_000), point(2, 10_000, 5_000)],
    pending: 0,
    taskRunning: true,
    ...over,
  };
}

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
async function renderD5() {
  await render(<ActiveTrip />, { wrapper });
  await screen.findByTestId('d5-end');
  await waitFor(() => expect(screen.queryByTestId(/^d5-gps-|^d5-problem-/)).toBeTruthy());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNet.isConnected = true;
  mockNet.isInternetReachable = true;
  mockPerms.current = {
    platform: 'android',
    foreground: 'granted',
    precise: true,
    background: 'granted',
    notifications: 'granted',
    servicesEnabled: true,
  };
  mockLive.current = snapshot();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => qc.clear());

describe('D5 sync status', () => {
  it('all synced', async () => {
    await renderD5();
    expect(screen.getByTestId('d5-sync-synced')).toHaveTextContent(/All trip data synced/);
  });
  it('points waiting', async () => {
    mockLive.current = snapshot({ pending: 12 });
    await renderD5();
    expect(screen.getByTestId('d5-sync-waiting')).toHaveTextContent(/12 points waiting to upload/);
  });
  it('offline with points saved on the phone', async () => {
    mockLive.current = snapshot({ pending: 142 });
    mockNet.isInternetReachable = false;
    await renderD5();
    expect(screen.getByTestId('d5-sync-offline')).toHaveTextContent(
      /Offline · 142 points saved on phone, will upload automatically/,
    );
  });
});

describe('D5 stats and GPS', () => {
  it('shows elapsed time, approx km from the local route, and km to drop', async () => {
    await renderD5();
    expect(screen.getByTestId('d5-time')).toHaveTextContent(/1h 05m/);
    expect(screen.getByTestId('d5-distance')).toHaveTextContent(/2\.0 km.*approx\./);
    expect(screen.getByTestId('d5-to-drop')).toHaveTextContent(/10 km/);
    expect(screen.getByTestId('d5-gps-good')).toHaveTextContent(/GPS good · ±8 m/);
  });
  it('weak GPS', async () => {
    mockLive.current = snapshot({ route: [point(1, 10_000, 5_000, 90)] });
    await renderD5();
    expect(screen.getByTestId('d5-gps-weak')).toHaveTextContent(/Weak GPS · ±90 m/);
  });
  it('no point for over 2 minutes → tracking-problem banner with Fix', async () => {
    mockLive.current = snapshot({ route: [point(1, 10_000, 4 * 60_000)] });
    await renderD5();
    expect(screen.getByTestId('d5-problem-no-points')).toHaveTextContent(/No GPS point for 4 min/);
    await act(async () => fireEvent.press(screen.getByTestId('d5-fix')));
    expect(mockRestart).toHaveBeenCalled();
  });
  it('standing still (fresh fix at the last point) is not a problem', async () => {
    mockLive.current = snapshot({ route: [point(1, 10_000, 4 * 60_000)] });
    await renderD5();
    const p = destination(DROP, 90, 10_010);
    await act(async () => mockEmit?.({ lat: p.lat, lng: p.lng, accuracy: 8, timestamp: Date.now() }));
    expect(screen.getByTestId('d5-gps-stopped')).toBeTruthy();
    expect(screen.queryByTestId('d5-problem-no-points')).toBeNull();
  });
  it('permission revoked → banner, Fix opens D1', async () => {
    mockPerms.current = { ...mockPerms.current, background: 'denied' };
    await renderD5();
    expect(screen.getByTestId('d5-problem-permission')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('d5-fix')));
    expect(mockPush).toHaveBeenCalledWith('/permissions');
  });
  it('location task not running → banner', async () => {
    mockLive.current = snapshot({ taskRunning: false });
    await renderD5();
    expect(screen.getByTestId('d5-problem-not-running')).toBeTruthy();
  });
});

describe('D5 end flow', () => {
  it('outside the drop: outline END, sheet warns but still ends, then D6', async () => {
    mockEndTrip.mockResolvedValue({ state: 'ENDED', tripId: 't1', serverStatus: 'needs_review' });
    await renderD5();
    expect(screen.queryByTestId('d5-near-drop')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('d5-end')));
    expect(screen.getByTestId('d5-end-outside')).toHaveTextContent(/You're 10 km from the delivery point/);
    await act(async () => fireEvent.press(screen.getByTestId('d5-end-confirm')));
    expect(mockEndTrip).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/driver/trips/t1/summary');
  });

  it('Keep tracking closes the sheet without ending', async () => {
    await renderD5();
    await act(async () => fireEvent.press(screen.getByTestId('d5-end')));
    await act(async () => fireEvent.press(screen.getByTestId('d5-end-cancel')));
    expect(mockEndTrip).not.toHaveBeenCalled();
  });

  it('near drop: banner, solid END, no warning in the sheet', async () => {
    mockLive.current = snapshot({ route: [point(1, 300, 5_000)] });
    await renderD5();
    expect(screen.getByTestId('d5-near-drop')).toHaveTextContent(/You've reached the delivery area/);
    await act(async () => fireEvent.press(screen.getByTestId('d5-end')));
    expect(screen.queryByTestId('d5-end-outside')).toBeNull();
  });

  it('ending offline still goes to D6 (ENDED_PENDING_SYNC)', async () => {
    mockEndTrip.mockResolvedValue({ state: 'ENDED_PENDING_SYNC', tripId: 't1', reason: 'NETWORK' });
    mockNet.isConnected = false;
    await renderD5();
    await act(async () => fireEvent.press(screen.getByTestId('d5-end')));
    await act(async () => fireEvent.press(screen.getByTestId('d5-end-confirm')));
    expect(mockReplace).toHaveBeenCalledWith('/driver/trips/t1/summary');
  });

  it('a trip already ended on this phone redirects to D6', async () => {
    const base = snapshot();
    mockLive.current = { ...base, state: { ...base.state!, state: 'ENDED_PENDING_SYNC' } };
    await render(<ActiveTrip />, { wrapper });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('redirect:/driver/trips/t1/summary'));
  });
});

describe('D5 Android back', () => {
  it('goes to My Trips and never ends the trip', async () => {
    const spy = jest.spyOn(BackHandler, 'addEventListener');
    await renderD5();
    const handler = spy.mock.calls.at(-1)![1] as () => boolean;
    let handled = false;
    await act(async () => {
      handled = handler();
    });
    expect(handled).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith('/driver');
    expect(mockEndTrip).not.toHaveBeenCalled();
  });
});

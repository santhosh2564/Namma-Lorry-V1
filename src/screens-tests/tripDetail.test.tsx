// RNTL: D4 START button states (docs/10 "start button disabled states, D4 statuses").
// Lives outside app/ so Expo Router doesn't treat it as a route.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { destination } from '@/lib/geo';
import { TripError } from '@/tracking/errors';

import TripDetail from '../../app/driver/trips/[id]/index';

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 't1' }),
  useRouter: () => ({ replace: mockReplace, push: mockPush, back: jest.fn(), canGoBack: () => true }),
}));

const pickup = { lat: 12.9563, lng: 79.9422 };
const mockTrip = {
  current: {
    id: 't1',
    status: 'assigned',
    created_at: '2026-09-26T00:00:00Z',
    started_at: null as string | null,
    load: {
      id: 'l1',
      load_code: 'NL-2026-000143',
      pickup_address: 'Sriperumbudur SIPCOT, Tamil Nadu',
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      pickup_radius_m: 500,
      drop_address: 'Vellore',
      drop_lat: 12.9165,
      drop_lng: 79.1325,
      drop_radius_m: 500,
      planned_distance_m: 41_000,
      material: 'Auto parts',
      weight_kg: 6500,
    },
    vehicle: { id: 'v1', registration_no: 'TN 23 BK 4521', vehicle_type: '19ft' },
  },
};
jest.mock('@/features/trips/api', () => ({
  ...jest.requireActual('@/features/trips/api'),
  useMyTrip: () => ({ isPending: false, isError: false, data: mockTrip.current, refetch: jest.fn() }),
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/useRoutingDecision', () => ({ localTripQueryKey: ['tracking', 'local-state'] }));

const mockPermissions = { ok: true };
jest.mock('@/tracking/permissions', () => ({
  permissionsQueryKey: ['tracking', 'permissions'],
  checkTrackingPermissions: async () => mockPermissions,
}));

let mockEmit:
  ((fix: { lat: number; lng: number; accuracy: number | null; timestamp: number }) => void) | null = null;
jest.mock('@/tracking/foregroundLocation', () => ({
  watchForegroundFix: (onFix: typeof mockEmit) => {
    mockEmit = onFix;
    return () => {
      mockEmit = null;
    };
  },
}));

const mockStartTrip = jest.fn();
jest.mock('@/tracking/runtime', () => ({
  getTracking: async () => ({ engine: { startTrip: mockStartTrip } }),
}));
jest.mock('@/components/map/MapView', () => ({ MapView: () => null }));

// gcTime Infinity: no garbage-collection timers left running after the test.
let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function renderScreen() {
  await render(<TripDetail />, { wrapper });
  // Let the permissions query settle (the foreground watch starts once it resolves).
  if (mockPermissions.ok) await waitFor(() => expect(mockEmit).not.toBeNull());
}

async function gps(distanceM: number, accuracy: number | null = 8) {
  // The foreground watch starts once the permissions query resolves.
  await waitFor(() => expect(mockEmit).not.toBeNull());
  const p = destination(pickup, 90, distanceM);
  await act(async () => mockEmit?.({ lat: p.lat, lng: p.lng, accuracy, timestamp: Date.now() }));
}

const startButton = () => screen.getByTestId('d4-start');
const isDisabled = () => startButton().props.accessibilityState?.disabled;

beforeEach(() => {
  jest.clearAllMocks();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  mockTrip.current = { ...mockTrip.current, status: 'assigned' };
  mockPermissions.ok = true;
});

afterEach(() => qc.clear());

describe('D4 Trip Detail & Start', () => {
  it('shows the load and waits for GPS with START disabled', async () => {
    await renderScreen();
    expect(screen.getByText('NL-2026-000143')).toBeTruthy();
    expect(screen.getByText('Auto parts · 6.5 t')).toBeTruthy();
    expect(screen.getByText('TN 23 BK 4521 · 19ft')).toBeTruthy();
    expect(screen.getByText('41 km')).toBeTruthy();
    expect(screen.getByTestId('d4-status-waiting-gps')).toBeTruthy();
    expect(isDisabled()).toBe(true);
  });

  it('weak GPS (accuracy > 50 m) keeps START disabled', async () => {
    await renderScreen();
    await gps(100, 80);
    expect(screen.getByTestId('d4-status-weak-gps')).toHaveTextContent(/±80 m/);
    expect(isDisabled()).toBe(true);
  });

  it('outside the pickup radius shows the distance and keeps START disabled', async () => {
    await renderScreen();
    await gps(3200);
    expect(screen.getByTestId('d4-status-outside')).toHaveTextContent(
      "You're 3.2 km from the pickup. Move inside the circle to start.",
    );
    expect(isDisabled()).toBe(true);
    fireEvent.press(startButton());
    expect(mockStartTrip).not.toHaveBeenCalled();
  });

  it('distance updates as the driver moves into the circle; ready enables START', async () => {
    await renderScreen();
    await gps(3200);
    await gps(120, 8);
    expect(screen.getByTestId('d4-status-ready')).toHaveTextContent(
      "You're at the pickup · GPS accuracy 8 m",
    );
    expect(isDisabled()).toBe(false);
  });

  it('START calls tracking.startTrip, shows starting, then goes to D5', async () => {
    let resolve!: () => void;
    mockStartTrip.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    await renderScreen();
    await gps(50);
    await act(async () => fireEvent.press(startButton()));
    expect(mockStartTrip).toHaveBeenCalledWith('t1');
    expect(screen.getByTestId('d4-status-starting')).toBeTruthy();
    expect(startButton().props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await act(async () => resolve());
    expect(mockReplace).toHaveBeenCalledWith('/driver/trips/t1/live');
  });

  it('server OUTSIDE_PICKUP opens the outside-pickup sheet and stays on D4', async () => {
    mockStartTrip.mockRejectedValue(new TripError('OUTSIDE_PICKUP', 1800));
    await renderScreen();
    await gps(50);
    await act(async () => fireEvent.press(startButton()));
    expect(screen.getByTestId('d4-outside-sheet')).toBeTruthy();
    expect(screen.getByText("You're 1.8 km from the pickup. Move inside the circle to start.")).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('other start errors show the driver text; TRACKING_START_FAILED still goes to D5', async () => {
    mockStartTrip.mockRejectedValueOnce(new TripError('NETWORK'));
    await renderScreen();
    await gps(50);
    await act(async () => fireEvent.press(startButton()));
    expect(screen.getByTestId('d4-error')).toHaveTextContent(/offline/);
    expect(mockReplace).not.toHaveBeenCalled();

    mockStartTrip.mockRejectedValueOnce(new TripError('TRACKING_START_FAILED'));
    await act(async () => fireEvent.press(startButton()));
    expect(mockReplace).toHaveBeenCalledWith('/driver/trips/t1/live');
  });

  it('missing permissions: no START, a Fix permissions button to D1', async () => {
    mockPermissions.ok = false;
    await renderScreen();
    fireEvent.press(await screen.findByTestId('d4-fix-permissions'));
    expect(screen.queryByTestId('d4-start')).toBeNull();
    expect(mockEmit).toBeNull(); // no GPS watch without permission
    expect(mockPush).toHaveBeenCalledWith('/permissions');
  });

  it('a trip already in progress offers Resume instead of START', async () => {
    mockTrip.current = { ...mockTrip.current, status: 'in_progress' };
    await renderScreen();
    expect(screen.queryByTestId('d4-start')).toBeNull();
    fireEvent.press(screen.getByTestId('d4-resume'));
    expect(mockReplace).toHaveBeenCalledWith('/driver/trips/t1/live');
  });

  it('a finished trip cannot be started', async () => {
    mockTrip.current = { ...mockTrip.current, status: 'verified' };
    await renderScreen();
    expect(screen.queryByTestId('d4-start')).toBeNull();
    expect(screen.getByTestId('d4-status-not-startable')).toBeTruthy();
  });
});

// RNTL: D1 Location Permission. The disclosure is visible before any system dialog,
// requests run strictly in order, and Continue records consent (docs/09 §1–§2).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { PermissionSnapshot } from '@/features/onboarding/permissionModel';

import LocationPermission from '../../app/(onboarding)/permissions';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/lib/config', () => ({ config: {} }));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@/features/auth/store', () => ({ useAuthStore: () => 'user-1' }));

const mockSnap: { current: PermissionSnapshot } = { current: {} as PermissionSnapshot };
const mockCalls: string[] = [];
jest.mock('@/tracking/permissions', () => ({
  permissionsQueryKey: ['tracking', 'permissions'],
  readPermissions: async () => ({ ...mockSnap.current }),
  requestForeground: async () => {
    mockCalls.push('foreground');
    mockSnap.current.foreground = 'granted';
  },
  requestBackground: async () => {
    mockCalls.push('background');
    mockSnap.current.background = 'granted';
  },
  requestNotifications: async () => {
    mockCalls.push('notifications');
    mockSnap.current.notifications = 'denied';
  },
  openAppSettings: async () => void mockCalls.push('settings'),
  openLocationServicesSettings: async () => void mockCalls.push('gps-settings'),
}));

const mockRecordConsent = jest.fn();
jest.mock('@/features/onboarding/consent', () => ({ recordConsent: () => mockRecordConsent() }));
const mockNeedsBattery = jest.fn();
jest.mock('@/features/onboarding/batteryFlag', () => ({ needsBatterySetup: () => mockNeedsBattery() }));

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockSnap.current = {
    platform: 'android',
    foreground: 'undetermined',
    precise: true,
    background: 'undetermined',
    notifications: 'undetermined',
    servicesEnabled: true,
  };
  mockRecordConsent.mockResolvedValue(undefined);
  mockNeedsBattery.mockResolvedValue(true);
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => qc.clear());

const continueDisabled = () => screen.getByTestId('d1-continue').props.accessibilityState?.disabled;

async function press(testID: string) {
  await act(async () => fireEvent.press(await screen.findByTestId(testID)));
}

describe('D1 Location Permission', () => {
  it('shows the prominent disclosure and asks for nothing on open', async () => {
    await render(<LocationPermission />, { wrapper });
    expect(screen.getByText('Allow location for your trips')).toBeTruthy();
    expect(screen.getByText('Only during trips')).toBeTruthy();
    expect(screen.getByText(/even when the app is closed or the phone is locked/)).toBeTruthy();
    expect(screen.getByText('Shared with Namma Lorry operations for this load')).toBeTruthy();
    expect(await screen.findByText('0 of 3 ready')).toBeTruthy();
    expect(mockCalls).toEqual([]);
    expect(continueDisabled()).toBe(true);
    // Only the first step is offered.
    expect(screen.getByTestId('d1-location-action')).toBeTruthy();
    expect(screen.queryByTestId('d1-background-action')).toBeNull();
    expect(screen.queryByTestId('d1-notifications-action')).toBeNull();
  });

  it('requests foreground → background → notifications in order, then Continue records consent', async () => {
    await render(<LocationPermission />, { wrapper });
    await press('d1-location-action');
    await press('d1-background-action');
    await press('d1-notifications-action');
    expect(mockCalls).toEqual(['foreground', 'background', 'notifications']);
    // Notifications refused: optional (ND-30), explained, Continue allowed.
    expect(await screen.findByTestId('d1-notifications-off')).toBeTruthy();
    await waitFor(() => expect(continueDisabled()).toBe(false));

    await press('d1-continue');
    expect(mockRecordConsent).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith('/battery');
  });

  it('goes to the splash router when battery setup is not needed', async () => {
    mockSnap.current = {
      ...mockSnap.current,
      foreground: 'granted',
      background: 'granted',
      notifications: 'granted',
    };
    mockNeedsBattery.mockResolvedValue(false);
    await render(<LocationPermission />, { wrapper });
    expect(await screen.findByText('3 of 3 ready')).toBeTruthy();
    await press('d1-continue');
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('blocked "Allow all the time": explains and opens settings instead of a dialog', async () => {
    mockSnap.current = { ...mockSnap.current, foreground: 'granted', background: 'blocked' };
    await render(<LocationPermission />, { wrapper });
    expect(await screen.findByTestId('d1-blocked')).toHaveTextContent(/Allow all the time/);
    await press('d1-background-action');
    expect(mockCalls).toEqual(['settings']);
    expect(continueDisabled()).toBe(true);
  });

  it('consent failure keeps the driver on D1 with an error', async () => {
    mockSnap.current = {
      ...mockSnap.current,
      foreground: 'granted',
      background: 'granted',
      notifications: 'granted',
    };
    mockRecordConsent.mockRejectedValue(new Error('offline'));
    await render(<LocationPermission />, { wrapper });
    await screen.findByText('3 of 3 ready');
    await press('d1-continue');
    expect(screen.getByTestId('d1-error')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('GPS switched off: warns with a shortcut to location settings', async () => {
    mockSnap.current = { ...mockSnap.current, servicesEnabled: false };
    await render(<LocationPermission />, { wrapper });
    expect(await screen.findByTestId('d1-gps-off')).toBeTruthy();
  });
});

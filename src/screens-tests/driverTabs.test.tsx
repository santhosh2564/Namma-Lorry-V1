// RNTL: D7 Trip History (filters, month groups, link to D6) and D8 My Profile
// (read-only stats + caption, health check, language sheet, sign out blocked during a trip).
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { PermissionSnapshot } from '@/features/onboarding/permissionModel';
import { applyLanguage } from '@/i18n';

import TripHistory from '../../app/driver/(tabs)/history';
import MyProfile from '../../app/driver/(tabs)/profile';
import { touchTargetIssues } from './helpers/a11y';
import * as db from './helpers/supabaseMock';

jest.mock('@/lib/supabase', () => jest.requireActual('./helpers/supabaseMock').module);
jest.mock('@/lib/config', () => ({
  config: { EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://example.com/privacy' },
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
jest.mock('@/features/auth/store', () => ({
  useAuthStore: (sel: (s: { status: string; session: { user: { id: string } } }) => unknown) =>
    sel({ status: 'signed-in', session: { user: { id: 'me' } } }),
}));
const mockPerms: { current: PermissionSnapshot } = { current: {} as PermissionSnapshot };
jest.mock('@/tracking/permissions', () => ({
  permissionsQueryKey: ['tracking', 'permissions'],
  readPermissions: async () => mockPerms.current,
}));
const mockBattery = { needed: false };
jest.mock('@/features/onboarding/batteryFlag', () => ({ needsBatterySetup: async () => mockBattery.needed }));
const mockSignOut = jest.fn();
jest.mock('@/features/auth/signOut', () => ({ signOut: () => mockSignOut() }));

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  db.reset();
  mockPush.mockReset();
  mockPerms.current = {
    platform: 'android',
    foreground: 'granted',
    precise: true,
    background: 'granted',
    notifications: 'granted',
    servicesEnabled: true,
  };
  mockBattery.needed = false;
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => qc.clear());

const hist = (id: string, status: string, ended: string, km: number) => ({
  id,
  status,
  created_at: ended,
  started_at: ended,
  ended_at: ended,
  tracked_distance_m: km * 1000,
  load: {
    load_code: `NL-2026-000${id}`,
    pickup_address: 'Sriperumbudur, TN',
    drop_address: 'Coimbatore, TN',
  },
});

describe('D7 Trip History', () => {
  beforeEach(() => {
    db.tables.trips = [
      hist('142', 'verified', '2026-09-26T06:00:00Z', 512),
      hist('139', 'needs_review', '2026-09-22T06:00:00Z', 125),
      hist('120', 'verified', '2026-08-20T06:00:00Z', 168),
    ];
  });

  it('groups by month with counts, summary and km only for verified trips', async () => {
    await render(<TripHistory />, { wrapper });
    expect(await screen.findByTestId('d7-month-2026-09')).toHaveTextContent(/SEPTEMBER 2026.*2 trips/);
    expect(screen.getByTestId('d7-month-2026-08')).toHaveTextContent(/AUGUST 2026/);
    expect(screen.getByTestId('d7-summary')).toHaveTextContent('2 verified · 1 under review');
    expect(screen.getByTestId('d7-trip-142')).toHaveTextContent(
      /NL-2026-000142.*26 Sep.*Sriperumbudur → Coimbatore.*512 km.*Verified/,
    );
    expect(screen.getByTestId('d7-trip-139')).toHaveTextContent(/Under review/);
    expect(screen.getByTestId('d7-trip-139')).not.toHaveTextContent(/125 km/);
    const q = db.log.find((l) => l.table === 'trips')!;
    expect(q.ops).toContainEqual(['eq', ['driver_id', 'me']]);
  });

  it('every touch target is labelled and at least 48 dp (M12a)', async () => {
    await render(<TripHistory />, { wrapper });
    await screen.findByTestId('d7-trip-139');
    expect(touchTargetIssues(screen.root)).toEqual([]);
  });

  it('filters by status and opens D6', async () => {
    await render(<TripHistory />, { wrapper });
    await screen.findByTestId('d7-trip-139');
    await act(async () => fireEvent.press(screen.getByTestId('d7-filter-review')));
    expect(screen.queryByTestId('d7-trip-142')).toBeNull();
    expect(screen.queryByTestId('d7-month-2026-08')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('d7-filter-rejected')));
    expect(screen.getByTestId('d7-empty-filter')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('d7-filter-all')));
    fireEvent.press(screen.getByTestId('d7-trip-142'));
    expect(mockPush).toHaveBeenCalledWith('/driver/trips/142/summary');
  });

  it('empty state', async () => {
    db.tables.trips = [];
    await render(<TripHistory />, { wrapper });
    expect(await screen.findByTestId('d7-empty')).toHaveTextContent(/No trips yet/);
  });
});

describe('D8 My Profile', () => {
  beforeEach(() => {
    db.tables.profiles = [
      {
        id: 'me',
        role: 'driver',
        full_name: 'Murugan S',
        phone: '919840234521',
        is_active: true,
        preferred_language: 'en',
        consent_version: '2026-09-v1',
        created_at: '2024-10-02T00:00:00Z',
      },
    ];
    db.tables.driver_stats = [
      { verified_trips: 38, verified_distance_m: 14_860_000, last_verified_at: '2026-09-26T06:00:00Z' },
    ];
  });

  it('shows the read-only verified experience with the "can\'t be edited" caption', async () => {
    await render(<MyProfile />, { wrapper });
    expect(await screen.findByText('Murugan S')).toBeTruthy();
    expect(screen.getByText('+91 98402 34521')).toBeTruthy();
    expect(screen.getByText('Driver since Oct 2024 on Namma Lorry')).toBeTruthy();
    expect(screen.getByTestId('d8-caption')).toHaveTextContent(
      "Calculated by Namma Lorry from GPS — can't be edited",
    );
    await waitFor(() => expect(screen.getByTestId('d8-trips')).toHaveTextContent(/38/));
    expect(screen.getByTestId('d8-km')).toHaveTextContent(/14,860/);
    expect(screen.getByTestId('d8-last')).toHaveTextContent(/26 Sep/);
    expect(screen.queryByRole('textbox' as never)).toBeNull(); // nothing editable
  });

  it('health check: all good, or needs attention and opens the fix screen', async () => {
    await render(<MyProfile />, { wrapper });
    expect(await screen.findByText('All good')).toBeTruthy();
    await qc.resetQueries();
    mockPerms.current = { ...mockPerms.current, background: 'denied' };
    await act(async () => {
      await qc.refetchQueries();
    });
    expect(await screen.findByText('Needs attention')).toBeTruthy();
    fireEvent.press(screen.getByTestId('d8-health'));
    expect(mockPush).toHaveBeenCalledWith('/permissions');
  });

  it('battery setup never done → opens D2', async () => {
    mockBattery.needed = true;
    await render(<MyProfile />, { wrapper });
    expect(await screen.findByText('Needs attention')).toBeTruthy();
    fireEvent.press(screen.getByTestId('d8-health'));
    expect(mockPush).toHaveBeenCalledWith('/battery');
  });

  it('language sheet: picking Tamil applies it and saves it on the profile (0005)', async () => {
    db.rpc.mockResolvedValue({ data: 'ta', error: null });
    await render(<MyProfile />, { wrapper });
    await act(async () => fireEvent.press(await screen.findByTestId('d8-language')));
    const sheet = screen.getByTestId('language-sheet');
    expect(sheet).toHaveTextContent(/English.*தமிழ் \(Tamil\).*ಕನ್ನಡ.*हिन्दी/);
    // ta/kn/hi are still TODO: they fall back to English and say so.
    expect(sheet).toHaveTextContent(/Some text still shows in English/);
    await act(async () => {
      fireEvent.press(screen.getByTestId('language-ta'));
      await new Promise((r) => setTimeout(r, 0)); // let the save (SecureStore + RPC) settle
    });
    expect(db.rpc).toHaveBeenCalledWith('set_preferred_language', { p_language: 'ta' });
    expect(screen.getByTestId('language-ta')).toBeChecked();
    expect(screen.getByTestId('d8-language')).toHaveTextContent(/தமிழ்/);
    await act(async () => applyLanguage('en'));
  });

  it('every touch target is labelled and at least 48 dp (M12a)', async () => {
    await render(<MyProfile />, { wrapper });
    await screen.findByTestId('d8-health');
    expect(touchTargetIssues(screen.root)).toEqual([]);
    await act(async () => fireEvent.press(screen.getByTestId('d8-language')));
    expect(touchTargetIssues(screen.root)).toEqual([]);
  });

  it('network error: plain message and Try again (M12a)', async () => {
    db.errors.driver_stats = { message: 'TypeError: Network request failed' };
    await render(<MyProfile />, { wrapper });
    expect(await screen.findByTestId('d8-error')).toHaveTextContent(/You're offline\. Check your connection/);
    delete db.errors.driver_stats;
    await act(async () => fireEvent.press(screen.getByTestId('d8-error-retry')));
    await waitFor(() => expect(screen.queryByTestId('d8-error')).toBeNull());
    expect(screen.getByTestId('d8-trips')).toHaveTextContent(/38/);
  });

  it('privacy policy row and sign out blocked during an active trip', async () => {
    mockSignOut.mockResolvedValue({ ok: false, reason: 'TRIP_ACTIVE' });
    await render(<MyProfile />, { wrapper });
    expect(await screen.findByTestId('d8-privacy')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByLabelText('Sign out')));
    expect(screen.getByTestId('signout-blocked')).toHaveTextContent(/trip in progress/);
  });
});

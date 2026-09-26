// RNTL: D6 Trip Summary variants — verifying, verified (+ totals), needs review (reasons),
// rejected, ended offline — and the realtime update from Verifying to Verified.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { LiveSnapshot } from '@/tracking/liveTrip';

import TripSummary from '../../app/driver/trips/[id]/summary';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 't1' }),
  useRouter: () => ({ replace: mockReplace }),
  Redirect: ({ href }: { href: string }) => {
    mockReplace(`redirect:${href}`);
    return null;
  },
}));
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

type Row = {
  id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  tracked_distance_m: number | null;
  verification_reasons: string[];
  verification_metrics: unknown;
  review_note: string | null;
  load: { load_code: string; pickup_address: string; drop_address: string } | null;
};
const mockRow: { current: Row | null } = { current: null };
const mockStats = { verified_trips: 38, verified_distance_m: 14_860_000 };
jest.mock('@/features/trips/api', () => ({
  ...jest.requireActual('@/features/trips/api'),
  fetchTripSummary: async () => mockRow.current,
  useDriverStats: (enabled: boolean) => ({ data: enabled ? mockStats : undefined }),
}));

let mockRealtime: (() => void) | null = null;
jest.mock('@/features/trips/useTripRealtime', () => ({
  useTripRealtime: (_id: string, enabled: boolean, onChange: () => void) => {
    mockRealtime = enabled ? onChange : null;
  },
}));

const mockLocal: { current: LiveSnapshot } = { current: {} as LiveSnapshot };
const mockSync = jest.fn(async () => undefined);
jest.mock('@/tracking/liveTrip', () => ({
  liveTripKey: (id: string) => ['tracking', 'live', id],
  getLiveSnapshot: async () => mockLocal.current,
  syncNow: () => mockSync(),
}));

const EMPTY_LOCAL: LiveSnapshot = { state: null, route: [], pending: 0, taskRunning: null };
function localState(state: 'ENDED' | 'ENDED_PENDING_SYNC' | 'TRACKING', pending: number): LiveSnapshot {
  return {
    ...EMPTY_LOCAL,
    pending,
    state: {
      trip_id: 't1',
      state,
      next_seq: 27,
      started_at: '2026-09-26T03:00:00.000Z',
      ended_at: '2026-09-26T12:42:00.000Z',
      end_lat: null,
      end_lng: null,
      end_accuracy: null,
      last_seq: 26,
      server_status: null,
      last_error: null,
      updated_at: '2026-09-26T12:42:00.000Z',
    },
  };
}
const row = (over: Partial<Row>): Row => ({
  id: 't1',
  status: 'completed',
  started_at: '2026-09-26T03:00:00.000Z',
  ended_at: '2026-09-26T12:42:00.000Z',
  tracked_distance_m: null,
  verification_reasons: [],
  verification_metrics: null,
  review_note: null,
  load: {
    load_code: 'NL-2026-000142',
    pickup_address: 'Sriperumbudur SIPCOT, Tamil Nadu',
    drop_address: 'Coimbatore Kurichi, Tamil Nadu',
  },
  ...over,
});

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
async function renderD6(testID: string) {
  await render(<TripSummary />, { wrapper });
  return screen.findByTestId(testID);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLocal.current = EMPTY_LOCAL;
  mockRow.current = null;
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => qc.clear());

describe('D6 Trip Summary', () => {
  it('Verifying while the server has the trip as completed; realtime moves it to Verified', async () => {
    mockLocal.current = localState('ENDED', 0);
    mockRow.current = row({ status: 'completed' });
    await renderD6('d6-verifying');
    expect(screen.getByText('Checking your trip…')).toBeTruthy();
    expect(mockRealtime).not.toBeNull();

    mockRow.current = row({ status: 'verified', tracked_distance_m: 512_000 });
    await act(async () => mockRealtime!());
    expect(await screen.findByTestId('d6-verified')).toBeTruthy();
    expect(mockRealtime).toBeNull(); // unsubscribed once final
  });

  it('Verified: km, time, route and totals from driver_stats', async () => {
    mockRow.current = row({ status: 'verified', tracked_distance_m: 512_000 });
    await renderD6('d6-verified');
    expect(screen.getByText('Trip verified')).toBeTruthy();
    expect(screen.getByTestId('d6-km')).toHaveTextContent('512 km');
    expect(screen.getByText('9h 42m')).toBeTruthy();
    expect(screen.getByText(/Sriperumbudur SIPCOT → Coimbatore Kurichi · 26 Sep 2026/)).toBeTruthy();
    expect(screen.getByTestId('d6-total')).toHaveTextContent('Your total: 38 verified trips · 14,860 km');
  });

  it('Needs review: plain-language reasons with details, no totals', async () => {
    mockRow.current = row({
      status: 'needs_review',
      verification_reasons: ['END_OUTSIDE_DROP', 'TRACKING_GAP'],
      verification_metrics: { end_distance_m: 1830, max_gap_s: 1500 },
    });
    await renderD6('d6-needs-review');
    expect(screen.getByText('Trip under review')).toBeTruthy();
    expect(screen.getByText("Namma Lorry will check this. You don't need to do anything.")).toBeTruthy();
    expect(screen.getByTestId('d6-reason-END_OUTSIDE_DROP')).toHaveTextContent(
      /Trip didn't end at the delivery location \(1\.8 km away\)/,
    );
    expect(screen.getByTestId('d6-reason-TRACKING_GAP')).toHaveTextContent(
      /Tracking stopped for a long time \(25 min\)/,
    );
    expect(screen.queryByTestId('d6-total')).toBeNull();
    expect(mockRealtime).toBeNull();
  });

  it('Rejected: reasons and the admin note', async () => {
    mockRow.current = row({
      status: 'rejected',
      verification_reasons: ['MOCK_LOCATION'],
      review_note: 'Fake GPS',
    });
    await renderD6('d6-rejected');
    expect(screen.getByTestId('d6-reason-MOCK_LOCATION')).toHaveTextContent(/Fake GPS app detected/);
    expect(screen.getByTestId('d6-review-note')).toHaveTextContent('Note from Namma Lorry: Fake GPS');
  });

  it('Ended offline: says it will verify later, shows waiting points, can retry', async () => {
    mockLocal.current = localState('ENDED_PENDING_SYNC', 5);
    mockRow.current = row({ status: 'in_progress' });
    await renderD6('d6-ended-offline');
    expect(screen.getByText("Ended offline — will verify when you're online.")).toBeTruthy();
    expect(screen.getByTestId('d6-pending')).toHaveTextContent('5 points still on this phone');
    await act(async () => fireEvent.press(screen.getByTestId('d6-retry')));
    expect(mockSync).toHaveBeenCalled();
  });

  it('regression: sync finishes and cleans the local copy → shows the result, never bounces to D5', async () => {
    mockLocal.current = localState('ENDED_PENDING_SYNC', 20);
    mockRow.current = row({ status: 'in_progress' });
    await renderD6('d6-ended-offline');

    // Back online: the runtime syncs, the server verifies, cleanup deletes the local rows.
    mockRow.current = row({ status: 'needs_review', verification_reasons: ['END_OUTSIDE_DROP'] });
    mockLocal.current = EMPTY_LOCAL;
    await act(async () => {
      await qc.refetchQueries({ queryKey: ['tracking', 'live', 't1'] });
    });
    expect(await screen.findByTestId('d6-needs-review')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalledWith('redirect:/driver/trips/t1/live');
  });

  it('regression: server result arrives before the phone notices its end was synced → shows the result', async () => {
    mockLocal.current = localState('ENDED_PENDING_SYNC', 0);
    mockRow.current = row({ status: 'in_progress' });
    await renderD6('d6-ended-offline');
    mockRow.current = row({ status: 'needs_review', verification_reasons: ['END_OUTSIDE_DROP'] });
    await act(async () => mockRealtime!()); // local still says ENDED_PENDING_SYNC
    expect(await screen.findByTestId('d6-needs-review')).toBeTruthy();
  });

  it('Ended offline even when the server is unreachable', async () => {
    mockLocal.current = localState('ENDED_PENDING_SYNC', 0);
    mockRow.current = null;
    await renderD6('d6-ended-offline');
  });

  it('a trip still tracking goes back to D5', async () => {
    mockLocal.current = localState('TRACKING', 0);
    mockRow.current = row({ status: 'in_progress' });
    await render(<TripSummary />, { wrapper });
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('redirect:/driver/trips/t1/live'));
  });

  it('Back to My Trips', async () => {
    mockRow.current = row({ status: 'verified', tracked_distance_m: 1000 });
    await renderD6('d6-verified');
    fireEvent.press(screen.getByTestId('d6-back'));
    expect(mockReplace).toHaveBeenCalledWith('/driver');
  });
});

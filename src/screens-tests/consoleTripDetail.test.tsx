// RNTL: C6 Trip Detail & Review — review panel only for needs_review, mandatory note,
// admin_review_trip called then everything refetched (no optimistic UI), live append, replay.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { ChangePayload } from '@/lib/useRealtimeChanges';

import ConsoleTripDetail from '../../app/console/trips/[id]';

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 't1' }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

let mockMapProps: {
  markers?: { id: string; position: { lat: number } }[];
  polylines?: { id: string; path: unknown[] }[];
} = {};
jest.mock('@/components/map/MapView', () => ({
  MapView: (props: typeof mockMapProps) => {
    mockMapProps = props;
    return null;
  },
}));
jest.mock('@/features/loads/api', () => ({ usePlannedRoute: () => ({ data: undefined }) }));

let mockRealtime: { onChange: (p: ChangePayload) => void; onResync: () => void } | null = null;
jest.mock('@/lib/useRealtimeChanges', () => ({
  useRealtimeChanges: (o: { onChange: (p: ChangePayload) => void; onResync: () => void }) => {
    mockRealtime = o;
    return 'live';
  },
}));

const mockTripRow: { current: Record<string, unknown> } = { current: {} };
const mockRpc = jest.fn();
const mockCalls: string[] = [];
function mockBuilder(table: string) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  for (const m of ['select', 'eq', 'order', 'range']) q[m] = chain;
  q.maybeSingle = async () => {
    mockCalls.push(`${table}.single`);
    return { data: mockTripRow.current, error: null };
  };
  q.then = (resolve: (v: unknown) => void) => {
    mockCalls.push(table);
    if (table === 'trip_points') resolve({ data: mockPoints, error: null });
    else if (table === 'trip_events') resolve({ data: mockEvents, error: null });
    else resolve({ data: [], error: null });
  };
  return q;
}
jest.mock('@/lib/supabase', () => ({
  supabase: { from: (t: string) => mockBuilder(t), rpc: (...a: unknown[]) => mockRpc(...a) },
}));

const mockPoints = Array.from({ length: 5 }, (_, i) => ({
  seq: i + 1,
  lat: 12.95 + i * 0.01,
  lng: 79.94,
  recorded_at: new Date(Date.parse('2026-09-26T00:40:00Z') + i * 60_000).toISOString(),
  heading: 90,
  speed_mps: 10,
  accuracy_m: 8,
  is_mocked: false,
}));
const mockEvents = [
  { id: 1, type: 'started', payload: null, created_at: '2026-09-26T00:40:00Z', actor_id: null },
  {
    id: 2,
    type: 'ended',
    payload: { expected_points: 5 },
    created_at: '2026-09-26T10:22:00Z',
    actor_id: null,
  },
  {
    id: 3,
    type: 'needs_review',
    payload: { reasons: ['END_OUTSIDE_DROP'] },
    created_at: '2026-09-26T10:23:00Z',
    actor_id: null,
  },
];

function tripRow(status: string, over: Record<string, unknown> = {}) {
  return {
    id: 't1',
    status,
    created_at: '2026-09-25T00:00:00Z',
    started_at: '2026-09-26T00:40:00Z',
    ended_at: status === 'in_progress' ? null : '2026-09-26T10:22:00Z',
    start_lat: 12.95,
    start_lng: 79.94,
    start_accuracy_m: 8,
    end_lat: status === 'in_progress' ? null : 12.99,
    end_lng: status === 'in_progress' ? null : 79.94,
    end_accuracy_m: 8,
    expected_points: 5,
    tracked_distance_m: 512_000,
    verification_reasons: status === 'needs_review' ? ['END_OUTSIDE_DROP'] : [],
    verification_metrics: { points: 5, max_gap_s: 60, end_distance_m: 1830 },
    verified_at: null,
    review_note: null,
    device_info: null,
    driver: { id: 'd1', full_name: 'Murugan S', phone: '919000000011' },
    vehicle: { id: 'v1', registration_no: 'TN 23 BK 4521', vehicle_type: '19ft' },
    reviewer: null,
    load: {
      id: 'l1',
      load_code: 'NL-2026-000142',
      pickup_address: 'Sriperumbudur',
      pickup_lat: 12.95,
      pickup_lng: 79.94,
      pickup_radius_m: 500,
      drop_address: 'Vellore',
      drop_lat: 12.91,
      drop_lng: 79.13,
      drop_radius_m: 500,
      planned_distance_m: 88_000,
      material: null,
      weight_kg: null,
    },
    live: null,
    ...over,
  };
}

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
async function renderC6() {
  await render(<ConsoleTripDetail />, { wrapper });
  await screen.findByTestId('c6-load-code');
  await screen.findByTestId('c6-timeline');
  await screen.findByTestId('c6-replay');
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCalls.length = 0;
  mockTripRow.current = tripRow('needs_review');
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
});
afterEach(() => qc.clear());

describe('C6 needs review', () => {
  it('shows reasons, metrics, timeline and the review card', async () => {
    await renderC6();
    expect(screen.getByTestId('c6-reasons')).toHaveTextContent(
      /END_OUTSIDE_DROP · Trip didn't end at the delivery location \(1\.8 km away\)/,
    );
    expect(screen.getByTestId('c6-metrics')).toHaveTextContent(/Points5 \/ 5/);
    expect(screen.getByTestId('c6-timeline')).toHaveTextContent(/Started 26 Sep 06:10/);
    expect(screen.getByTestId('c6-timeline')).toHaveTextContent(/Flagged for review/);
    expect(screen.getByTestId('c6-approve')).toBeTruthy();
  });

  it('a note is mandatory: no RPC without one', async () => {
    await renderC6();
    await act(async () => fireEvent.press(screen.getByTestId('c6-approve')));
    expect(screen.getByTestId('c6-review-error')).toHaveTextContent(/Write a note/);
    await act(async () => fireEvent.changeText(screen.getByTestId('c6-note'), '   '));
    await act(async () => fireEvent.press(screen.getByTestId('c6-reject')));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('approve calls admin_review_trip, then refetches from the server (no optimistic change)', async () => {
    let resolve!: (v: unknown) => void;
    mockRpc.mockReturnValue(new Promise((r) => (resolve = r)));
    await renderC6();
    await act(async () => fireEvent.changeText(screen.getByTestId('c6-note'), ' Checked with shipper '));
    await act(async () => fireEvent.press(screen.getByTestId('c6-approve')));
    expect(mockRpc).toHaveBeenCalledWith('admin_review_trip', {
      p_trip_id: 't1',
      p_approve: true,
      p_note: 'Checked with shipper',
    });
    // Still needs_review on screen while the call is in flight: nothing optimistic.
    expect(screen.getByTestId('c6-approve')).toBeTruthy();
    const before = mockCalls.filter((c) => c === 'trips.single').length;
    mockTripRow.current = tripRow('verified', {
      review_note: 'Checked with shipper',
      reviewer: { full_name: 'Ops' },
    });
    await act(async () => resolve({ data: { id: 't1', status: 'verified' }, error: null }));
    await waitFor(() => expect(screen.queryByTestId('c6-approve')).toBeNull());
    expect(mockCalls.filter((c) => c === 'trips.single').length).toBeGreaterThan(before);
    expect(screen.getByTestId('c6-outcome')).toHaveTextContent('Approved by Ops: Checked with shipper');
  });

  it('reject with a server error shows it and still refreshes', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'TRIP_NOT_IN_REVIEW', code: 'P0001' } });
    await renderC6();
    await act(async () => fireEvent.changeText(screen.getByTestId('c6-note'), 'Fake GPS'));
    const before = mockCalls.filter((c) => c === 'trips.single').length;
    await act(async () => fireEvent.press(screen.getByTestId('c6-reject')));
    expect(mockRpc).toHaveBeenCalledWith('admin_review_trip', {
      p_trip_id: 't1',
      p_approve: false,
      p_note: 'Fake GPS',
    });
    expect(await screen.findByTestId('c6-review-error')).toHaveTextContent(/already decided/);
    await waitFor(() => expect(mockCalls.filter((c) => c === 'trips.single').length).toBeGreaterThan(before));
  });
});

describe('C6 other states', () => {
  it('verified by system: no review card', async () => {
    mockTripRow.current = tripRow('verified');
    await renderC6();
    expect(screen.queryByTestId('c6-approve')).toBeNull();
    expect(screen.getByTestId('c6-outcome')).toHaveTextContent('Verified by system · 512 km');
  });

  it('live: appends trip_live points from realtime and shows the truck', async () => {
    mockTripRow.current = tripRow('in_progress', {
      live: { lat: 12.99, lng: 79.94, heading: 90, recorded_at: mockPoints[4]!.recorded_at },
    });
    await renderC6();
    expect(screen.queryByTestId('c6-approve')).toBeNull();
    expect(mockMapProps.polylines!.find((p) => p.id === 'actual')!.path).toHaveLength(5);
    await act(async () =>
      mockRealtime!.onChange({
        table: 'trip_live',
        eventType: 'UPDATE',
        new: { trip_id: 't1', lat: 13.1, lng: 79.94, heading: 90, recorded_at: '2026-09-26T01:00:00Z' },
        old: {},
      }),
    );
    // TanStack notifies observers on the next macrotask
    await waitFor(() => expect(mockMapProps.polylines!.find((p) => p.id === 'actual')!.path).toHaveLength(6));
    expect(mockMapProps.markers!.find((m) => m.id === 'truck')!.position.lat).toBe(13.1);
  });

  it('replay: play steps through the points and stops at the end', async () => {
    jest.useFakeTimers();
    mockTripRow.current = tripRow('verified');
    await renderC6();
    await act(async () => fireEvent.press(screen.getByTestId('c6-play')));
    // index 0: a single point draws no line yet
    expect(mockMapProps.polylines!.find((p) => p.id === 'actual')).toBeUndefined();
    await act(async () => jest.advanceTimersByTime(100));
    expect(mockMapProps.polylines!.find((p) => p.id === 'actual')!.path).toHaveLength(2);
    for (let i = 0; i < 10; i++) await act(async () => jest.advanceTimersByTime(100));
    expect(mockMapProps.polylines!.find((p) => p.id === 'actual')!.path).toHaveLength(5);
    expect(screen.getByLabelText('Play replay')).toBeTruthy(); // stopped at the end
    jest.useRealTimers();
  });
});

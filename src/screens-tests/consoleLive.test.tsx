// RNTL: C1 Live Dashboard (KPIs, stale rows, realtime merge + resync) and C7 Review Queue.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { ChangePayload } from '@/lib/useRealtimeChanges';

import LiveDashboard from '../../app/console/index';
import ReviewQueue from '../../app/console/review/index';
import * as db from './helpers/supabaseMock';

jest.mock('@/lib/supabase', () => jest.requireActual('./helpers/supabaseMock').module);
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn() }) }));
let mockMap: {
  markers?: { id: string; stale?: boolean; position: { lat: number } }[];
  onMarkerPress?: (id: string) => void;
} = {};
jest.mock('@/components/map/MapView', () => ({
  MapView: (p: typeof mockMap) => {
    mockMap = p;
    return null;
  },
}));
let mockRt: { onChange: (p: ChangePayload) => void; onResync: () => void } | null = null;
let mockRtStatus = 'live';
jest.mock('@/lib/useRealtimeChanges', () => ({
  useRealtimeChanges: (o: { onChange: (p: ChangePayload) => void; onResync: () => void }) => {
    mockRt = o;
    return mockRtStatus;
  },
}));

const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
function liveTrip(id: string, vehicle: string, liveAgoMs: number | null) {
  return {
    id,
    started_at: ago(3_600_000),
    driver: { id: `d${id}`, full_name: `Driver ${id}`, phone: null },
    vehicle: { id: `v${id}`, registration_no: vehicle, vehicle_type: '19ft' },
    load: {
      id: `l${id}`,
      load_code: `NL-2026-00014${id}`,
      pickup_address: 'Sriperumbudur, TN',
      drop_address: 'Coimbatore, TN',
    },
    live:
      liveAgoMs === null
        ? null
        : {
            lat: 12.9,
            lng: 79.9,
            heading: 90,
            speed_mps: 10,
            accuracy_m: 8,
            recorded_at: ago(liveAgoMs),
            updated_at: ago(liveAgoMs),
          },
  };
}

let qc: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  db.reset();
  mockPush.mockReset();
  mockRtStatus = 'live';
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => qc.clear());

describe('C1 Live Dashboard', () => {
  beforeEach(() => {
    // Every "trips" read returns: in_progress list, then the two counts are head queries.
    db.tables.trips = [liveTrip('1', 'TN 23 BK 4521', 40_000), liveTrip('2', 'KA 01 AK 9841', 18 * 60_000)];
  });

  it('lists live trips with age, stale in red first, and the KPI strip', async () => {
    await render(<LiveDashboard />, { wrapper });
    await screen.findByTestId('c1-row-2');
    expect(screen.getByTestId('c1-age-1')).toHaveTextContent('40 s ago');
    expect(screen.getByTestId('c1-age-2')).toHaveTextContent('18 min ago');
    expect(screen.getByText('No recent data')).toBeTruthy();
    expect(screen.getByTestId('c1-kpi-live')).toHaveTextContent(/2live/);
    expect(screen.getByTestId('c1-kpi-stale')).toHaveTextContent(/1stale/);
    expect(mockMap.markers!.map((m) => [m.id, m.stale])).toEqual([
      ['2', true],
      ['1', false],
    ]);
    // the in_progress list query
    expect(
      db.log.some((l) => l.table === 'trips' && l.ops.some(([m, a]) => m === 'eq' && a[1] === 'in_progress')),
    ).toBe(true);
  });

  it('realtime trip_live UPDATE moves the marker without a refetch', async () => {
    await render(<LiveDashboard />, { wrapper });
    await screen.findByTestId('c1-row-2');
    const reads = db.log.length;
    await act(async () =>
      mockRt!.onChange({
        table: 'trip_live',
        eventType: 'UPDATE',
        new: { trip_id: '2', lat: 13.5, lng: 80, heading: 45, recorded_at: ago(1_000) },
        old: {},
      }),
    );
    await waitFor(() => expect(screen.getByTestId('c1-age-2')).toHaveTextContent(/s ago/));
    expect(screen.queryByText('No recent data')).toBeNull();
    expect(mockMap.markers!.find((m) => m.id === '2')!.position.lat).toBe(13.5);
    expect(db.log.filter((l) => l.table === 'trips').length).toBe(
      db.log.slice(0, reads).filter((l) => l.table === 'trips').length,
    );
  });

  it('a new trip (unknown id) or a resubscribe refetches', async () => {
    await render(<LiveDashboard />, { wrapper });
    await screen.findByTestId('c1-row-2');
    db.tables.trips = [...(db.tables.trips as unknown[]), liveTrip('3', 'TN 01 AB 1234', 5_000)];
    await act(async () =>
      mockRt!.onChange({
        table: 'trip_live',
        eventType: 'INSERT',
        new: { trip_id: '3', lat: 1, lng: 2, recorded_at: ago(0) },
        old: {},
      }),
    );
    expect(await screen.findByTestId('c1-row-3')).toBeTruthy();
    db.tables.trips = [liveTrip('1', 'TN 23 BK 4521', 10_000)];
    await act(async () => mockRt!.onResync());
    await waitFor(() => expect(screen.queryByTestId('c1-row-3')).toBeNull());
  });

  it('shows the reconnecting banner while realtime retries; empty state', async () => {
    mockRtStatus = 'retrying';
    db.tables.trips = [];
    await render(<LiveDashboard />, { wrapper });
    expect(await screen.findByTestId('c1-empty')).toHaveTextContent('No trips are running right now.');
    expect(screen.getByTestId('c1-realtime-retrying')).toBeTruthy();
  });

  it('row and marker open C6', async () => {
    await render(<LiveDashboard />, { wrapper });
    fireEvent.press(await screen.findByTestId('c1-row-1'));
    expect(mockPush).toHaveBeenCalledWith('/console/trips/1');
    mockMap.onMarkerPress!('2');
    expect(mockPush).toHaveBeenCalledWith('/console/trips/2');
  });
});

describe('C7 Review Queue', () => {
  const queued = (id: string, endedAgoMs: number, reasons: string[]) => ({
    id,
    started_at: ago(endedAgoMs + 3_600_000),
    ended_at: ago(endedAgoMs),
    end_lat: 12.9,
    end_lng: 79.2,
    start_lat: 12.95,
    start_lng: 79.94,
    verification_reasons: reasons,
    verification_metrics: { max_gap_s: 1320 },
    driver: { id: 'd', full_name: 'Murugan S', phone: null },
    vehicle: { id: 'v', registration_no: 'TN 23 BK 4521', vehicle_type: '19ft' },
    load: {
      id: 'l',
      load_code: `NL-2026-0001${id}`,
      pickup_address: 'Sriperumbudur, TN',
      pickup_lat: 12.95,
      pickup_lng: 79.94,
      drop_address: 'Vellore, TN',
      drop_lat: 12.91,
      drop_lng: 79.13,
      drop_radius_m: 500,
    },
  });

  it('lists needs_review trips oldest first with plain-language reason chips', async () => {
    db.tables.trips = [queued('41', 2 * 3_600_000, ['TRACKING_GAP', 'END_OUTSIDE_DROP'])];
    await render(<ReviewQueue />, { wrapper });
    expect(await screen.findByText('Trips to review (1)')).toBeTruthy();
    expect(screen.getByTestId('c7-reasons-41')).toHaveTextContent(
      /Tracking stopped for a long time \(22 min\)/,
    );
    expect(screen.getByTestId('c7-reasons-41')).toHaveTextContent(/Trip didn't end at the delivery location/);
    expect(screen.getByText('Ended 2 h ago')).toBeTruthy();
    const q = db.log.find((l) => l.table === 'trips')!;
    expect(q.ops).toContainEqual(['eq', ['status', 'needs_review']]);
    expect(q.ops).toContainEqual(['order', ['ended_at', { ascending: true, nullsFirst: true }]]);
    fireEvent.press(screen.getByTestId('c7-open-41'));
    expect(mockPush).toHaveBeenCalledWith('/console/trips/41');
  });

  it('empty state', async () => {
    db.tables.trips = [];
    await render(<ReviewQueue />, { wrapper });
    expect(await screen.findByTestId('c7-empty')).toHaveTextContent('All caught up');
  });
});

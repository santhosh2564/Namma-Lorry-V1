/**
 * Demo dataset for UI work WITHOUT a backend (no EXPO_PUBLIC_SUPABASE_ANON_KEY) in
 * development builds only. Never used when a Supabase client exists, and never as a
 * fallback for failed or empty queries — showing invented trips or stats as if they were
 * real would undermine "verified experience" (M12a hardening fix).
 */
import type { DriverStats, LiveTrip, Trip, TripEvent, TripPoint } from './types';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export const demoTrips = (): Trip[] => [
  {
    id: 'demo-trip-1',
    load_id: 'demo-load-1',
    load_code: 'NL-2026-000143',
    pickup_address: 'SIPCOT Phase 1, Hosur',
    drop_address: 'Peenya Industrial Area, Bengaluru',
    pickup_lat: 12.7392,
    pickup_lng: 77.8233,
    drop_lat: 13.0329,
    drop_lng: 77.5273,
    planned_distance_m: 41000,
    driver_id: 'demo-driver-1',
    driver_name: 'Murugan S',
    status: 'in_progress',
    started_at: ago(48),
    ended_at: null,
    tracked_distance_m: null,
    verification_reasons: [],
    verification_metrics: null,
    review_note: null,
  },
  {
    id: 'demo-trip-2',
    load_id: 'demo-load-2',
    load_code: 'NL-2026-000142',
    pickup_address: 'SIPCOT Industrial Park, Sriperumbudur',
    drop_address: 'Kurichi Industrial Estate, Coimbatore',
    pickup_lat: 12.9563,
    pickup_lng: 79.9422,
    drop_lat: 10.9608,
    drop_lng: 76.9656,
    planned_distance_m: 512000,
    driver_id: 'demo-driver-2',
    driver_name: 'Ravi Kumar',
    status: 'needs_review',
    started_at: ago(26 * 60),
    ended_at: ago(24 * 60 - 400),
    tracked_distance_m: 498300,
    verification_reasons: ['END_OUTSIDE_DROP', 'TRACKING_GAP'],
    verification_metrics: { points: 1540, avg_kmh: 42.8, max_gap_s: 1020 },
    review_note: null,
  },
];

export const demoPoints = (trip: Trip): TripPoint[] =>
  Array.from({ length: 18 }, (_, index) => ({
    trip_id: trip.id,
    seq: index + 1,
    recorded_at: ago((18 - index) * 3),
    lat: trip.pickup_lat + (trip.drop_lat - trip.pickup_lat) * (index / 17),
    lng: trip.pickup_lng + (trip.drop_lng - trip.pickup_lng) * (index / 17),
    accuracy_m: 8,
    speed_mps: 11,
    heading: 135,
  }));

export const demoLiveTrips = (): LiveTrip[] =>
  demoTrips()
    .filter((trip) => trip.status === 'in_progress')
    .map((trip) => ({
      trip_id: trip.id,
      driver_id: trip.driver_id,
      driver_name: trip.driver_name,
      load_code: trip.load_code,
      status: 'in_progress',
      lat: trip.pickup_lat + 0.12,
      lng: trip.pickup_lng - 0.1,
      speed_mps: 12,
      heading: 315,
      recorded_at: ago(2),
      updated_at: ago(2),
    }));

export const demoEvents = (tripId: string): TripEvent[] => [
  { id: 1, trip_id: tripId, type: 'started', payload: null, created_at: ago(26 * 60) },
  {
    id: 2,
    trip_id: tripId,
    type: 'needs_review',
    payload: { reasons: ['END_OUTSIDE_DROP'] },
    created_at: ago(24 * 60),
  },
];

export const demoProfile = () => ({
  name: 'Murugan S',
  phone: '919000004521',
  language: 'en',
  stats: {
    verified_trips: 42,
    verified_distance_m: 18_430_000,
    first_verified_at: '2026-01-18T00:00:00Z',
    last_verified_at: ago(60),
  } satisfies DriverStats,
  active: false,
});

export type TripStatus =
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'verified'
  | 'needs_review'
  | 'rejected'
  | 'cancelled';

export type LiveTrip = {
  trip_id: string;
  driver_id: string;
  driver_name: string;
  load_code: string;
  status: 'in_progress';
  lat: number;
  lng: number;
  speed_mps: number | null;
  heading: number | null;
  recorded_at: string;
  updated_at: string;
};

export type Trip = {
  id: string;
  load_id: string;
  load_code: string;
  pickup_address: string;
  drop_address: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_lat: number;
  drop_lng: number;
  planned_distance_m: number | null;
  driver_id: string;
  driver_name: string;
  status: TripStatus;
  started_at: string | null;
  ended_at: string | null;
  tracked_distance_m: number | null;
  verification_reasons: string[];
  verification_metrics: Record<string, number | null> | null;
  review_note: string | null;
};

export type TripPoint = {
  id?: number;
  trip_id: string;
  seq: number;
  recorded_at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  speed_mps: number | null;
  heading: number | null;
};

export type TripEvent = {
  id: number;
  trip_id: string;
  type: string;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type DriverStats = {
  verified_trips: number;
  verified_distance_m: number;
  first_verified_at: string | null;
  last_verified_at: string | null;
};

export const reasonLabel = (reason: string) =>
  reason.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase());


/**
 * Playwright support for the local Supabase stack (M12b).
 * Keys are read from `supabase status` at runtime — nothing is hard-coded. The service
 * role key is used ONLY here, in test code, to create fixtures (never in the app bundle).
 * Sign-in uses the test OTP numbers from supabase/config.toml ([auth.sms.test_otp]).
 */
import { execSync } from 'node:child_process';

type Env = { url: string; anon: string; service: string };
let cached: Env | null = null;

export function localEnv(): Env {
  if (cached) return cached;
  const out = execSync('npx -y supabase@2.118.0 status -o env', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const get = (key: string) => new RegExp(`^${key}="?([^"\\n]+)"?$`, 'm').exec(out)?.[1] ?? '';
  cached = { url: get('API_URL'), anon: get('ANON_KEY'), service: get('SERVICE_ROLE_KEY') };
  if (!cached.url || !cached.anon || !cached.service)
    throw new Error('Local Supabase not running (`npx supabase start`).');
  return cached;
}

export type Session = {
  access_token: string;
  refresh_token: string;
  user: { id: string };
} & Record<string, unknown>;

/** Phone OTP sign-in with a seeded test number (OTP 123456). */
export async function signIn(phone: string): Promise<Session> {
  const { url, anon } = localEnv();
  const res = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, token: '123456', type: 'sms' }),
  });
  if (!res.ok) throw new Error(`sign-in ${phone} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Session;
}

/** localStorage key supabase-js uses for this URL: sb-<first host label>-auth-token. */
export const storageKey = () => `sb-${new URL(localEnv().url).hostname.split('.')[0]}-auth-token`;

async function call(path: string, init: RequestInit & { token?: string; service?: boolean }) {
  const { url, anon, service } = localEnv();
  const key = init.service ? service : anon;
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${init.token ?? key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

export const rest = {
  /** As a signed-in user (RLS applies). */
  asUser: (token: string, path: string, init: RequestInit = {}) =>
    call(`/rest/v1/${path}`, { ...init, token }),
  /** Service role — fixtures only. */
  asService: (path: string, init: RequestInit = {}) =>
    call(`/rest/v1/${path}`, { ...init, service: true }),
  rpc: (token: string, fn: string, args: Record<string, unknown>) =>
    call(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args), token }),
};

export const SEED = {
  adminPhone: '+919000000001',
  driverPhone: '+919000000012', // Ravi Kumar
  driverId: 'd0000000-0000-4000-8000-000000000002',
  driverName: 'Ravi Kumar',
  vehicleId: 'c0000000-0000-4000-8000-000000000002',
};

/** A fresh load (Hosur → Peenya) + assigned trip for the seeded driver. Returns the trip id. */
export async function createAssignedTrip(): Promise<{ tripId: string; loadCode: string }> {
  const load = await rest.asService('loads', {
    method: 'POST',
    body: JSON.stringify({
      pickup_address: 'E2E pickup, Hosur',
      pickup_lat: 12.7392,
      pickup_lng: 77.8233,
      drop_address: 'E2E drop, Peenya',
      drop_lat: 13.0329,
      drop_lng: 77.5273,
      planned_distance_m: 62000,
    }),
  });
  if (load.status !== 201) throw new Error(`load fixture: ${JSON.stringify(load.body)}`);
  const trip = await rest.asService('trips', {
    method: 'POST',
    body: JSON.stringify({
      load_id: load.body[0].id,
      driver_id: SEED.driverId,
      vehicle_id: SEED.vehicleId,
    }),
  });
  if (trip.status !== 201) throw new Error(`trip fixture: ${JSON.stringify(trip.body)}`);
  return { tripId: trip.body[0].id, loadCode: load.body[0].load_code };
}

/** Clears any in-progress trip the seeded driver was left with by an earlier run. */
export async function cancelActiveTrips() {
  await rest.asService(`trips?driver_id=eq.${SEED.driverId}&status=eq.in_progress`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelled' }),
  });
}

export const point = (tripId: string, seq: number, lat: number, lng: number, mocked = false) => ({
  trip_id: tripId,
  seq,
  recorded_at: new Date().toISOString(),
  lat,
  lng,
  accuracy_m: 8,
  speed_mps: 11,
  heading: 315,
  altitude_m: null,
  is_mocked: mocked,
});

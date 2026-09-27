import { readFileSync } from 'node:fs';

import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '../src/lib/database.types';

import { signIn } from './helpers';

// PRD P0-11 / doc 10 §1 "review-approve": a driver finishes a trip away from the drop (through the
// real RPCs and RLS, as the app would), the admin finds it in C7, must write a note in C6, approves,
// and the trip becomes verified with the driver's stats counted exactly once.

function env(name: string): string {
  if (process.env[name]) return process.env[name]!;
  const line = readFileSync('.env', 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} missing (see docs/DEV_SETUP.md)`);
  return line.slice(name.length + 1).trim();
}

async function driverFinishesTripAwayFromDrop() {
  const sb = createClient<Database>(
    env('EXPO_PUBLIC_SUPABASE_URL'),
    env('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  // Seeded driver Murugan; OTP from [auth.sms.test_otp].
  const otp = await sb.auth.signInWithOtp({ phone: '+919000000011', options: { shouldCreateUser: false } });
  if (otp.error) throw otp.error;
  const verified = await sb.auth.verifyOtp({ phone: '+919000000011', token: '123456', type: 'sms' });
  if (verified.error) throw verified.error;

  const { data: trips, error } = await sb
    .from('trips')
    .select('id, load:loads(load_code, pickup_lat, pickup_lng)')
    .eq('status', 'assigned')
    .limit(1);
  if (error) throw error;
  const trip = trips[0];
  if (!trip?.load) return null;
  const { pickup_lat: lat, pickup_lng: lng } = trip.load;

  const started = await sb.rpc('start_trip', { p_trip_id: trip.id, p_lat: lat, p_lng: lng, p_accuracy_m: 8 });
  if (started.error) throw started.error;
  // Three points a little north of the pickup, then end there: far from the drop → needs_review.
  const t0 = Date.now();
  const rows = [1, 2, 3].map((seq) => ({
    trip_id: trip.id,
    seq,
    recorded_at: new Date(t0 + seq * 1000).toISOString(),
    lat: lat + seq * 0.0005,
    lng,
    accuracy_m: 8,
    speed_mps: 5,
    heading: 0,
    altitude_m: null,
    is_mocked: false,
  }));
  const up = await sb.from('trip_points').upsert(rows, { onConflict: 'trip_id,seq', ignoreDuplicates: true });
  if (up.error) throw up.error;
  const ended = await sb.rpc('end_trip', {
    p_trip_id: trip.id,
    p_lat: rows[2]!.lat,
    p_lng: lng,
    p_accuracy_m: 8,
    p_ended_at: new Date(t0 + 4000).toISOString(),
    p_expected_points: 3,
  });
  if (ended.error) throw ended.error;
  const stats = async () =>
    (await sb.from('driver_stats').select('verified_trips').maybeSingle()).data?.verified_trips ?? 0;
  return { tripId: trip.id, loadCode: trip.load.load_code, status: ended.data?.status, stats };
}

test('admin reviews a needs_review trip: note required, approve → verified, stats +1', async ({ page }) => {
  const driver = await driverFinishesTripAwayFromDrop();
  test.skip(!driver, 'No assigned trip for the seeded driver: run `npx supabase db reset`.');
  expect(driver!.status).toBe('needs_review');
  const statsBefore = await driver!.stats();

  await signIn(page, '9000000001');
  await page.waitForURL('**/console');

  // C7: the trip is in the queue with plain-language reasons
  await page.goto('/console/review');
  await expect(page.getByTestId(`c7-reasons-${driver!.tripId}`)).toContainText(
    "Trip didn't end at the delivery location",
  );
  await page.getByTestId(`c7-open-${driver!.tripId}`).click();
  await page.waitForURL(`**/console/trips/${driver!.tripId}`);

  // C6: route, reasons, timeline; the decision needs a note
  await expect(page.getByTestId('c6-load-code')).toHaveText(driver!.loadCode);
  await expect(page.getByTestId('c6-replay')).toContainText('of 3');
  await expect(page.getByTestId('c6-timeline')).toContainText('Flagged for review');
  await page.getByTestId('c6-approve').click();
  await expect(page.getByTestId('c6-review-error')).toContainText('Write a note');

  await page.getByTestId('c6-note').fill('Delivered at the customer yard; confirmed by phone.');
  await page.getByTestId('c6-approve').click();

  // Refreshed from the server: verified, audited in the timeline, review card gone
  await expect(page.getByTestId('c6-outcome')).toContainText('Approved by Namma Lorry Ops');
  await expect(page.getByTestId('c6-timeline')).toContainText('Approved');
  await expect(page.getByTestId('c6-approve')).toHaveCount(0);
  await expect.poll(() => driver!.stats()).toBe(statsBefore + 1);

  // Queue is empty again (for this trip)
  await page.goto('/console/review');
  await expect(page.getByTestId(`c7-open-${driver!.tripId}`)).toHaveCount(0);
});

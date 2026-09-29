/**
 * Acceptance scenarios on the web console + REST API (docs/10 §4, M12b).
 * The driver side is driven through the same REST/RPC calls the app makes (docs/06),
 * because the driver screens and tracking engine (M8–M10) don't exist yet.
 * The admin side is the real C1/C6/C7 UI. Sign-in screens are placeholders (M5), so the
 * admin session is injected into localStorage exactly where supabase-js keeps it.
 */
import { expect, test, type Page } from '@playwright/test';

import {
  cancelActiveTrips,
  createAssignedTrip,
  point,
  rest,
  SEED,
  signIn,
  storageKey,
  type Session,
} from './support/supabase';

const PICKUP = { lat: 12.7392, lng: 77.8233 };

async function asAdmin(page: Page): Promise<Session> {
  const session = await signIn(SEED.adminPhone);
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    storageKey(),
    JSON.stringify(session),
  ] as const);
  return session;
}

async function startTrip(driver: Session, tripId: string) {
  const res = await rest.rpc(driver.access_token, 'start_trip', {
    p_trip_id: tripId,
    p_lat: PICKUP.lat,
    p_lng: PICKUP.lng,
    p_accuracy_m: 8,
    p_device_info: { os: 'e2e', osVersion: '0', model: 'playwright', appVersion: '0.1.0' },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  expect(res.body.status).toBe('in_progress');
}

test.beforeEach(async () => {
  await cancelActiveTrips();
});

test('scenario 9 — a driver calling the REST API cannot change trips or stats', async () => {
  const driver = await signIn(SEED.driverPhone);
  const { tripId } = await createAssignedTrip();

  const patch = await rest.asUser(driver.access_token, `trips?id=eq.${tripId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'verified', tracked_distance_m: 999999 }),
  });
  expect(patch.status).toBe(200);
  expect(patch.body).toEqual([]); // 0 rows updated

  const stats = await rest.asUser(driver.access_token, 'driver_stats', {
    method: 'POST',
    body: JSON.stringify({ driver_id: SEED.driverId, verified_trips: 999 }),
  });
  expect(stats.status).toBe(403);
  expect(stats.body.code).toBe('42501');

  const after = await rest.asService(`trips?id=eq.${tripId}&select=status,tracked_distance_m`);
  expect(after.body).toEqual([{ status: 'assigned', tracked_distance_m: null }]);
});

test('scenario 11 — C1 live view updates without refresh, ≤ 60 s behind the phone', async ({
  page,
}) => {
  page.on('console', (msg) => {
    if (msg.text().startsWith('[realtime]'))
      console.log(`${new Date().toISOString()} ${msg.text()}`);
  });
  await asAdmin(page);
  await page.goto('/console');
  await expect(page.getByText('No active trips')).toBeVisible();

  const driver = await signIn(SEED.driverPhone);
  const { tripId, loadCode } = await createAssignedTrip();
  await startTrip(driver, tripId);

  const sentAt = Date.now();
  const upload = await rest.asUser(driver.access_token, 'trip_points', {
    method: 'POST',
    body: JSON.stringify([point(tripId, 1, PICKUP.lat + 0.001, PICKUP.lng - 0.001)]),
  });
  expect(upload.status, JSON.stringify(upload.body)).toBe(201);

  const row = page.getByRole('button', {
    name: new RegExp(`${SEED.driverName}, load ${loadCode}`),
  });
  await expect(row).toBeVisible({ timeout: 60_000 });
  const delayS = (Date.now() - sentAt) / 1000;
  test.info().annotations.push({ type: 'live-delay-s', description: delayS.toFixed(1) });
  console.log(`scenario 11: point → C1 in ${delayS.toFixed(1)} s`);
  expect(delayS).toBeLessThanOrEqual(60); // PRD goal 4 / ND-15 (target ~30 s)
  await expect(page.getByText('1 live')).toBeVisible();

  // Clean up: the driver ends the trip.
  await rest.rpc(driver.access_token, 'end_trip', {
    p_trip_id: tripId,
    p_lat: PICKUP.lat,
    p_lng: PICKUP.lng,
    p_accuracy_m: 8,
    p_ended_at: new Date().toISOString(),
    p_expected_points: 1,
  });
});

test('scenario 11 (fallback) — with realtime blocked, C1 still catches up within 60 s by polling', async ({
  page,
}) => {
  // Kill every realtime WebSocket so only the 30 s refetchInterval can deliver the change.
  await page.routeWebSocket(/\/realtime\//, (ws) => ws.close());
  await asAdmin(page);
  await page.goto('/console');
  await expect(page.getByText('No active trips')).toBeVisible();

  const driver = await signIn(SEED.driverPhone);
  const { tripId, loadCode } = await createAssignedTrip();
  await startTrip(driver, tripId);
  const sentAt = Date.now();
  await rest.asUser(driver.access_token, 'trip_points', {
    method: 'POST',
    body: JSON.stringify([point(tripId, 1, PICKUP.lat + 0.001, PICKUP.lng - 0.001)]),
  });

  await expect(
    page.getByRole('button', { name: new RegExp(`${SEED.driverName}, load ${loadCode}`) }),
  ).toBeVisible({ timeout: 60_000 });
  const delayS = (Date.now() - sentAt) / 1000;
  console.log(`scenario 11 (no realtime): point → C1 in ${delayS.toFixed(1)} s`);
  expect(delayS).toBeLessThanOrEqual(60);

  await rest.rpc(driver.access_token, 'end_trip', {
    p_trip_id: tripId,
    p_lat: PICKUP.lat,
    p_lng: PICKUP.lng,
    p_accuracy_m: 8,
    p_ended_at: new Date().toISOString(),
    p_expected_points: 1,
  });
});

test('scenario 12 — admin approves a flagged trip in C7/C6 → verified, stats +1 once, event logged', async ({
  page,
}) => {
  const driver = await signIn(SEED.driverPhone);
  const { tripId, loadCode } = await createAssignedTrip();
  await startTrip(driver, tripId);
  const points = [
    point(tripId, 1, PICKUP.lat, PICKUP.lng),
    point(tripId, 2, PICKUP.lat + 0.0005, PICKUP.lng - 0.0005, true), // fake GPS
    point(tripId, 3, PICKUP.lat + 0.001, PICKUP.lng - 0.001),
  ];
  expect(
    (
      await rest.asUser(driver.access_token, 'trip_points', {
        method: 'POST',
        body: JSON.stringify(points),
      })
    ).status,
  ).toBe(201);
  const ended = await rest.rpc(driver.access_token, 'end_trip', {
    p_trip_id: tripId,
    p_lat: PICKUP.lat + 0.001,
    p_lng: PICKUP.lng - 0.001,
    p_accuracy_m: 8,
    p_ended_at: new Date().toISOString(),
    p_expected_points: 3,
  });
  expect(ended.body.status).toBe('needs_review');
  expect(ended.body.verification_reasons).toContain('MOCK_LOCATION');

  const statsBefore =
    (await rest.asService(`driver_stats?driver_id=eq.${SEED.driverId}&select=verified_trips`))
      .body[0]?.verified_trips ?? 0;

  await asAdmin(page);
  await page.goto('/console/review');
  await page
    .getByRole('button', { name: new RegExp(`Load ${loadCode}, driver ${SEED.driverName}`) })
    .click();
  await expect(page).toHaveURL(new RegExp(`/console/trips/${tripId}`));
  await expect(
    page.getByText('Needs review', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Fake GPS app detected').filter({ visible: true }).first(),
  ).toBeVisible();

  // Approve without a note is refused client-side (server also enforces NOTE_REQUIRED).
  page.once('dialog', (dialog) => void dialog.accept());
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(
    page.getByText('Needs review', { exact: true }).filter({ visible: true }),
  ).toBeVisible();

  const note = 'E2E: checked with shipper, delivered';
  await page.getByLabel('Review note, required').fill(note);
  await page.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByText('Verified', { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText('Approved by admin')).toBeVisible();
  await expect(page.getByText(`“${note}”`)).toBeVisible();
  await expect(page.getByLabel('Review note, required')).toHaveCount(0); // review panel gone

  const trip = (await rest.asService(`trips?id=eq.${tripId}&select=status,review_note,reviewed_by`))
    .body[0];
  expect(trip).toMatchObject({ status: 'verified', review_note: note });
  const statsAfter = (
    await rest.asService(`driver_stats?driver_id=eq.${SEED.driverId}&select=verified_trips`)
  ).body[0].verified_trips;
  expect(statsAfter).toBe(statsBefore + 1);
  const events = (
    await rest.asService(`trip_events?trip_id=eq.${tripId}&type=eq.approved&select=payload`)
  ).body;
  expect(events).toEqual([{ payload: { note } }]);
});

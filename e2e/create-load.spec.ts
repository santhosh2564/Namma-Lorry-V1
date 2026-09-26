import { expect, test } from '@playwright/test';

import { mockMapplsProxy, signIn, type ProxyCall } from './helpers';

test('admin creates a load and assigns it', async ({ page }) => {
  const calls: ProxyCall[] = [];
  await mockMapplsProxy(page, calls);

  await signIn(page, '9000000001');
  await page.waitForURL('**/console');

  // C2 → C3
  await page.getByRole('link', { name: /^Loads/ }).click();
  await page.waitForURL('**/console/loads');
  await page.getByTestId('create-load').click();
  await page.waitForURL('**/console/loads/new');

  // Validation before anything is filled in
  await page.getByTestId('create-load-submit').click();
  await expect(page.getByText('Enter the address.').first()).toBeVisible();

  // Pickup: autosuggest returns coordinates
  await page.getByTestId('pickup-address').fill('Hosur SIPCOT');
  await page.getByTestId('pickup-suggestions').getByText('SIPCOT Phase 2').click();
  await expect(page.getByTestId('pickup-location')).toContainText('12.74090, 77.82530');

  // Drop: autosuggest returns only an eLoc → set the pin by coordinates (ND-26)
  await page.getByTestId('drop-address').fill('Peenya');
  await page.getByTestId('drop-suggestions').getByText('Peenya Industrial Area').click();
  await expect(page.getByTestId('drop-location')).toContainText("didn't return coordinates");
  await page.getByText('Enter coordinates').last().click();
  await page.getByTestId('drop-coords').fill('13.0329, 77.5273');
  await expect(page.getByTestId('drop-location')).toContainText('13.03290, 77.52730');

  // Radius: +2 steps of 50 m on the drop geofence
  await page.getByRole('button', { name: 'Increase Drop radius' }).click();
  await page.getByRole('button', { name: 'Increase Drop radius' }).click();
  await expect(page.getByTestId('drop-radius')).toHaveAttribute('aria-valuenow', '600');

  // Planned route preview from the proxy
  await expect(page.getByTestId('planned-strip')).toContainText('Planned distance 41 km');

  await page.getByTestId('load-material').fill('Auto parts');
  await page.getByTestId('load-weight').fill('6.5');
  await page.getByTestId('create-load-submit').click();

  // C4: DB-generated load code, stored planned distance
  await page.waitForURL(/\/console\/loads\/[0-9a-f-]{36}$/);
  const code = (await page.getByTestId('load-code').innerText()).trim();
  expect(code).toMatch(/^NL-\d{4}-\d{6}$/);
  await expect(page.getByText('41 km').first()).toBeVisible();
  await expect(page.getByText('6.5 t')).toBeVisible();
  const distanceCall = calls.find((c) => c.action === 'distance');
  expect(distanceCall?.body).toEqual({
    action: 'distance',
    from: expect.objectContaining({ lat: 12.7409, lng: 77.8253 }),
    to: expect.objectContaining({ lat: 13.0329, lng: 77.5273 }),
  });

  // Assign: driver search shows verified stats; Murugan S (seeded) is available, pick Ravi Kumar
  await page.getByTestId('assign-submit').click();
  await expect(page.getByText('Choose a driver.')).toBeVisible();
  await page.getByTestId('assign-driver-search').fill('ravi');
  await page.getByRole('radio', { name: 'Ravi Kumar' }).click();
  await expect(page.getByText(/verified trips · /).first()).toBeVisible();
  await page.getByTestId('assign-vehicle-search').fill('KA 01');
  await page.getByRole('radio', { name: 'KA 01 AF 7788' }).click();
  await page.getByTestId('assign-submit').click();

  // Resulting trip and its status
  await expect(page.getByTestId('trip-status')).toContainText('Assigned');
  await expect(page.getByText(/Ravi Kumar/).first()).toBeVisible();

  // C2 shows it assigned (server-side search by Load ID)
  await page.getByRole('link', { name: /^Loads/ }).click();
  await page.getByTestId('loads-search').fill(code);
  await page.getByTestId('loads-search').press('Enter');
  await expect(page).toHaveURL(new RegExp(`q=${code}`));
  const row = page.getByRole('link', { name: `Open load ${code}` });
  await expect(row).toContainText('Assigned');
  await expect(row).toContainText('Ravi Kumar');

  // C5 lists the trip (status filter + Load ID search)
  await page.getByRole('link', { name: /^Trips/ }).click();
  await page.getByRole('checkbox', { name: 'Assigned' }).click();
  await page.getByTestId('trips-search').fill(code);
  await page.getByTestId('trips-search').press('Enter');
  const tripRow = page.getByRole('link', { name: `Open ${code}` });
  await expect(tripRow).toContainText('Ravi Kumar');
  await expect(tripRow).toContainText('KA 01 AF 7788');
});

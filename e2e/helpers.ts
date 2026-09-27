import type { Page, Route } from '@playwright/test';

/** Signs in with a seeded test number (OTP 123456 via [auth.sms.test_otp]). */
export async function signIn(page: Page, national: string) {
  await page.goto('/');
  await page.waitForURL('**/sign-in');
  await page.getByTestId('phone-input').fill(national);
  await page.getByTestId('send-otp').click();
  await page.waitForURL('**/verify');
  await page.getByTestId('otp-input').fill('123456');
}

export interface ProxyCall {
  action: string;
  body: Record<string, unknown>;
}

/** Mocks the mappls-proxy Edge Function with normalised (docs/06 §4) responses. */
export async function mockMapplsProxy(page: Page, calls: ProxyCall[]) {
  await page.route('**/functions/v1/mappls-proxy', async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({
        status: 200,
        headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' },
      });
    }
    const body = route.request().postDataJSON() as Record<string, unknown>;
    calls.push({ action: String(body.action), body });
    const json = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data),
      });
    switch (body.action) {
      case 'autosuggest':
        return json(
          String(body.query).toLowerCase().includes('hosur')
            ? [
                {
                  label: 'SIPCOT Phase 2',
                  address: 'Hosur, Krishnagiri District, Tamil Nadu, 635109',
                  lat: 12.7409,
                  lng: 77.8253,
                  eLoc: 'HOSR01',
                },
              ]
            : // Standard Mappls plan: no coordinates, only an eLoc (ND-26).
              [
                {
                  label: 'Peenya Industrial Area',
                  address: 'Bengaluru, Karnataka, 560058',
                  lat: null,
                  lng: null,
                  eLoc: 'PEEN01',
                },
              ],
        );
      case 'route':
        return json({
          distanceM: 41200,
          durationS: 4200,
          path: [
            { lat: 12.7409, lng: 77.8253 },
            { lat: 12.9, lng: 77.65 },
            { lat: 13.0329, lng: 77.5273 },
          ],
        });
      case 'distance':
        return json({ distanceM: 41200, durationS: 4200 });
      default:
        return route.fulfill({ status: 400, body: JSON.stringify({ error: 'INVALID_REQUEST' }) });
    }
  });
}

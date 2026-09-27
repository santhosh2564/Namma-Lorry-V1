import { REDACTED, scrubBreadcrumb, scrubEvent, scrubString, scrubValue } from './scrub';

describe('scrubString', () => {
  it.each([
    ['Driver +91 98402 34521 failed', `Driver ${REDACTED} failed`],
    ['phone 919840234521', `phone ${REDACTED}`],
    ['call 98402-34521 now', `call ${REDACTED} now`],
    ['9840234521', REDACTED],
    ['at 12.95630, 79.94220 ok', `at ${REDACTED} ok`],
    ['OUTSIDE_PICKUP:3200', 'OUTSIDE_PICKUP:3200'],
    ['lat 12.956301 only', `lat ${REDACTED} only`],
    ['/rest/v1/x?lat=12.95&lng=79.94&limit=5', `/rest/v1/x?lat=${REDACTED}&lng=${REDACTED}&limit=5`],
  ])('%s', (input, out) => expect(scrubString(input)).toBe(out));

  it('keeps ids, versions, timestamps and small numbers', () => {
    const keep = [
      'trip d0000000-0000-4000-8000-000000000001',
      'namma-lorry@1.0.0+12',
      '2026-09-26T06:00:00.123456+00:00',
      '200 rows in 1.5 s',
      'TRIP_NOT_IN_REVIEW',
      'seq 1234567',
    ];
    for (const s of keep) expect(scrubString(s)).toBe(s);
  });
});

describe('scrubValue', () => {
  it('drops sensitive keys at any depth and coordinate-like numbers', () => {
    expect(
      scrubValue({
        trip: { lat: 12.9, lng: 79.9, seq: 4, accuracy_m: 8.5, heading: 123.4 },
        profile: { phone: '919840234521', full_name: 'Murugan' },
        rows: [{ p_lat: 1, p_lng: 2, recorded_at: '2026-09-26T06:00:00Z' }],
        misc: 12.956301,
      }),
    ).toEqual({
      trip: { lat: REDACTED, lng: REDACTED, seq: 4, accuracy_m: 8.5, heading: 123.4 },
      profile: { phone: REDACTED, full_name: 'Murugan' },
      rows: [{ p_lat: REDACTED, p_lng: REDACTED, recorded_at: '2026-09-26T06:00:00Z' }],
      misc: REDACTED,
    });
  });
});

describe('scrubEvent / scrubBreadcrumb', () => {
  it('keeps only the user id and drops request bodies', () => {
    const e = scrubEvent({
      message: 'start_trip failed at 12.95630, 79.94220 for +91 98402 34521',
      user: { id: 'u-1', phone: '919840234521', ip_address: '1.2.3.4', username: 'Murugan' },
      request: { url: 'https://x/rest/v1/rpc/start_trip', method: 'POST', data: '{"p_lat":12.9}' },
      extra: { body: { p_lat: 12.95, p_lng: 79.94 } },
      exception: { values: [{ value: 'OUTSIDE_PICKUP:3200' }] },
    });
    expect(e.user).toEqual({ id: 'u-1' });
    expect(e.request).toEqual({ url: 'https://x/rest/v1/rpc/start_trip', method: 'POST' });
    expect(e.message).toBe(`start_trip failed at ${REDACTED} for ${REDACTED}`);
    expect(e.extra).toEqual({ body: { p_lat: REDACTED, p_lng: REDACTED } });
    expect(JSON.stringify(e)).not.toMatch(/9840234521|12\.95|79\.94/);
  });

  it('scrubs fetch breadcrumbs', () => {
    const b = scrubBreadcrumb({
      category: 'fetch',
      data: { url: 'https://x/functions/v1/mappls-proxy?lat=12.9563&lng=79.9422', status_code: 200 },
    });
    expect(b.data).toEqual({
      url: `https://x/functions/v1/mappls-proxy?lat=${REDACTED}&lng=${REDACTED}`,
      status_code: 200,
    });
  });
});

import { isNetworkError, isPermanentRowError, parseRpcError, TripError, tripErrorText } from './errors';

describe('parseRpcError', () => {
  it.each([
    'TRIP_NOT_FOUND',
    'TRIP_NOT_STARTABLE',
    'ANOTHER_TRIP_ACTIVE',
    'GPS_ACCURACY_TOO_LOW',
    'TRIP_NOT_ACTIVE',
    'FORBIDDEN',
    'NOTE_REQUIRED',
    'TRIP_NOT_IN_REVIEW',
  ])('maps %s', (code) => {
    const e = parseRpcError({ message: code, code: 'P0001' });
    expect(e).toBeInstanceOf(TripError);
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(false);
  });

  it('parses OUTSIDE_PICKUP:<metres>', () => {
    const e = parseRpcError({ message: 'OUTSIDE_PICKUP:3200', code: 'P0001' });
    expect(e.code).toBe('OUTSIDE_PICKUP');
    expect(e.distanceM).toBe(3200);
    expect(parseRpcError({ message: 'OUTSIDE_PICKUP:512.6' }).distanceM).toBe(513);
  });

  it('does not treat lookalikes as server codes', () => {
    expect(parseRpcError({ message: 'OUTSIDE_PICKUP:' }).code).toBe('UNKNOWN');
    expect(parseRpcError({ message: 'TRIP_NOT_FOUND extra' }).code).toBe('UNKNOWN');
  });

  it.each([
    { message: 'TypeError: Failed to fetch', code: '' },
    { message: 'Network request failed' },
    { message: 'x', status: 503 },
    { message: 'aborted', name: 'AbortError' },
  ])('network %#', (err) => {
    const e = parseRpcError(err);
    expect(e.code).toBe('NETWORK');
    expect(e.retryable).toBe(true);
  });

  it('unknown + null', () => {
    expect(parseRpcError({ message: 'boom', code: 'XX000' }).code).toBe('UNKNOWN');
    expect(parseRpcError(null).code).toBe('UNKNOWN');
  });
});

describe('isPermanentRowError / isNetworkError', () => {
  it('RLS and constraint violations are permanent; network and auth are not', () => {
    expect(
      isPermanentRowError({ code: '42501', message: 'new row violates row-level security policy' }),
    ).toBe(true);
    expect(isPermanentRowError({ code: '23514' })).toBe(true);
    expect(isPermanentRowError({ code: 'PGRST301', message: 'JWT expired' })).toBe(false);
    expect(isPermanentRowError({ message: 'Failed to fetch' })).toBe(false);
    expect(isNetworkError({ code: '42501', message: 'rls' })).toBe(false);
  });
});

describe('tripErrorText', () => {
  it('shows the pickup distance in km', () => {
    expect(tripErrorText(new TripError('OUTSIDE_PICKUP', 3200))).toBe(
      'You are 3.2 km from the pickup. Move inside the pickup area to start.',
    );
  });
});

import { TripError } from '@/tracking/errors';

import { errorInfo, errorMessage } from './errorMessage';
import { FunctionError } from './functions';

jest.mock('./supabase', () => ({ supabase: {} }));

describe('errorInfo', () => {
  it.each([
    [{ message: 'TRIP_NOT_IN_REVIEW', code: 'P0001' }, 'TRIP_NOT_IN_REVIEW'],
    [{ message: 'LANGUAGE_NOT_SUPPORTED', code: 'P0001' }, 'LANGUAGE_NOT_SUPPORTED'],
    [{ message: 'new row violates row-level security policy', code: '42501' }, 'PERMISSION_DENIED'],
    [{ message: 'duplicate key value', code: '23505' }, 'DUPLICATE'],
    [{ message: 'JWT expired', code: 'PGRST301' }, 'SESSION_EXPIRED'],
    [{ message: 'TypeError: Failed to fetch' }, 'NETWORK'],
    [{ message: 'something odd', code: 'XX000' }, 'UNKNOWN'],
    [new FunctionError('PHONE_EXISTS', 409), 'PHONE_EXISTS'],
    [new TripError('ANOTHER_TRIP_ACTIVE'), 'ANOTHER_TRIP_ACTIVE'],
    [null, 'UNKNOWN'],
  ])('%j → %s', (e, code) => expect(errorInfo(e).code).toBe(code));

  it('keeps the pickup distance', () => {
    expect(errorInfo({ message: 'OUTSIDE_PICKUP:3200' })).toEqual({
      code: 'OUTSIDE_PICKUP',
      distanceM: 3200,
    });
  });
});

describe('errorMessage', () => {
  it('friendly text for RPC, Postgres and network errors — never the raw message', () => {
    expect(errorMessage({ message: 'TRIP_NOT_STARTABLE' })).toBe(
      'This trip can no longer be started. Pull to refresh.',
    );
    expect(errorMessage({ message: 'OUTSIDE_PICKUP:3200' })).toBe(
      "You're 3.2 km from the pickup. Move inside the pickup area to start.",
    );
    expect(errorMessage({ message: 'Failed to fetch' })).toBe(
      "You're offline. Check your connection and try again.",
    );
    expect(errorMessage({ message: 'relation "x" does not exist', code: '42P01' })).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('screen-specific overrides win', () => {
    expect(
      errorMessage({ message: 'TRIP_NOT_IN_REVIEW' }, { TRIP_NOT_IN_REVIEW: 'Already decided here.' }),
    ).toBe('Already decided here.');
  });
});

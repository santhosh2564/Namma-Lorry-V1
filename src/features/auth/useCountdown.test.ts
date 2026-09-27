import { act, renderHook } from '@testing-library/react-native';

import { formatMmSs, useCountdown } from './useCountdown';

describe('useCountdown', () => {
  beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
  afterEach(() => jest.useRealTimers());

  it('counts down the 30 s resend timer and stops at 0', async () => {
    const { result } = await renderHook(() => useCountdown(1_000_000, 30));
    expect(result.current).toBe(30);
    await act(async () => jest.advanceTimersByTime(6_000));
    expect(result.current).toBe(24);
    await act(async () => jest.advanceTimersByTime(30_000));
    expect(result.current).toBe(0);
  });

  it('is 0 when nothing was sent', async () => {
    const { result } = await renderHook(() => useCountdown(null, 30));
    expect(result.current).toBe(0);
  });
});

describe('formatMmSs', () => {
  it('formats like the design ("0:24")', () => {
    expect(formatMmSs(24)).toBe('0:24');
    expect(formatMmSs(65)).toBe('1:05');
  });
});

import { formatDateIST } from './dates';

describe('formatDateIST', () => {
  it('formats in IST, including across the UTC date line', () => {
    expect(formatDateIST('2026-09-26T12:42:00.000Z')).toBe('26 Sep 2026');
    expect(formatDateIST('2026-09-26T19:00:00.000Z')).toBe('27 Sep 2026'); // 00:30 IST
    expect(formatDateIST('2026-12-31T18:29:00.000Z')).toBe('31 Dec 2026');
  });
});

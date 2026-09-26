import { formatDate, formatKm, paginate, sortRows } from './table';

describe('sortRows', () => {
  const rows = [
    { n: 'b', v: 2 },
    { n: 'a', v: null },
    { n: 'c', v: 10 },
    { n: 'd', v: 2 },
  ];
  it('sorts numbers both ways, nulls last, stable for ties', () => {
    expect(sortRows(rows, (r) => r.v, 'asc').map((r) => r.n)).toEqual(['b', 'd', 'c', 'a']);
    expect(sortRows(rows, (r) => r.v, 'desc').map((r) => r.n)).toEqual(['c', 'b', 'd', 'a']);
  });
  it('sorts strings naturally and case-insensitively', () => {
    const plates = ['TN 70 C 3310', 'ka 01 AF 7788', 'TN 23 BK 4521'].map((p) => ({ p }));
    expect(sortRows(plates, (r) => r.p, 'asc').map((r) => r.p)).toEqual([
      'ka 01 AF 7788',
      'TN 23 BK 4521',
      'TN 70 C 3310',
    ]);
  });
});

describe('paginate', () => {
  const rows = Array.from({ length: 45 }, (_, i) => i);
  it('slices and reports the range', () => {
    expect(paginate(rows, 1, 20)).toMatchObject({ page: 1, pageCount: 3, from: 21, to: 40, total: 45 });
    expect(paginate(rows, 2, 20).rows).toHaveLength(5);
  });
  it('clamps out-of-range pages and handles empty input', () => {
    expect(paginate(rows, 9, 20).page).toBe(2);
    expect(paginate([], 0, 20)).toMatchObject({ page: 0, pageCount: 1, from: 0, to: 0, total: 0 });
  });
});

describe('formatters', () => {
  it('formats dates in IST', () => {
    expect(formatDate('2026-09-25T20:00:00Z')).toBe('26 Sep 2026');
    expect(formatDate(null)).toBe('—');
  });
  it('formats km with Indian grouping', () => {
    expect(formatKm(114860.4)).toBe('1,14,860.4');
  });
});

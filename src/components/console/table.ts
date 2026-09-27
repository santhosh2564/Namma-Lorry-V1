// Pure sorting/paging used by DataTable (unit-tested).
import { t } from '@/i18n';

export type SortDir = 'asc' | 'desc';
export type SortValue = string | number | null | undefined;

/** Stable sort; null/undefined always last regardless of direction. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => SortValue, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((a, b) => {
      const an = a.v === null || a.v === undefined || a.v === '';
      const bn = b.v === null || b.v === undefined || b.v === '';
      if (an || bn) return an === bn ? a.i - b.i : an ? 1 : -1;
      const c =
        typeof a.v === 'number' && typeof b.v === 'number'
          ? a.v - b.v
          : String(a.v).localeCompare(String(b.v), 'en', { numeric: true, sensitivity: 'base' });
      return c === 0 ? a.i - b.i : c * sign;
    })
    .map((x) => x.row);
}

export interface Page<T> {
  rows: T[];
  page: number;
  pageCount: number;
  from: number;
  to: number;
  total: number;
}

/** 0-based page, clamped into range. */
export function paginate<T>(rows: readonly T[], page: number, size: number): Page<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(0, page), pageCount - 1);
  const start = p * size;
  const slice = rows.slice(start, start + size);
  return { rows: slice, page: p, pageCount, from: total ? start + 1 : 0, to: start + slice.length, total };
}

/** "26 Sep 2026" (en-IN), or "—". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  // Display in IST: operations are in India regardless of the viewer's machine timezone.
  const ist = new Date(d.getTime() + 330 * 60_000);
  return `${ist.getUTCDate()} ${t.common.months[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
}

/** "14,860.4" with Indian digit grouping. */
export function formatKm(km: number): string {
  return km.toLocaleString('en-IN', { maximumFractionDigits: 1 });
}

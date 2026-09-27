// D7 Trip History (docs/12 D7): driver-facing status, filters and month groups (IST). Pure.
import { t } from '@/i18n';

export type HistoryStatus = 'verified' | 'review' | 'rejected' | 'verifying' | 'cancelled';
export type HistoryFilter = 'all' | 'verified' | 'review' | 'rejected';

export const HISTORY_STATUSES = ['completed', 'verified', 'needs_review', 'rejected', 'cancelled'] as const;

export function historyStatus(status: string): HistoryStatus {
  switch (status) {
    case 'verified':
      return 'verified';
    case 'needs_review':
      return 'review';
    case 'rejected':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'verifying'; // completed: waiting for points / the sweeper
  }
}

export interface HistoryTrip {
  id: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  tracked_distance_m: number | null;
}

export const matchesFilter = (t: { status: string }, f: HistoryFilter): boolean =>
  f === 'all' || historyStatus(t.status) === f;

export function historyCounts(trips: { status: string }[]): Record<HistoryFilter, number> {
  const c = { all: trips.length, verified: 0, review: 0, rejected: 0 };
  for (const t of trips) {
    const s = historyStatus(t.status);
    if (s === 'verified' || s === 'review' || s === 'rejected') c[s] += 1;
  }
  return c;
}

const IST_OFFSET_MS = 5.5 * 3_600_000;

/** The date a trip belongs to: when it ended, else started, else was assigned. */
export const tripDate = (t: HistoryTrip): string => t.ended_at ?? t.started_at ?? t.created_at;

function ist(iso: string): Date {
  return new Date(Date.parse(iso) + IST_OFFSET_MS);
}

/** "26 Sep" in IST. */
export function dayMonthIST(iso: string): string {
  const d = ist(iso);
  return `${d.getUTCDate()} ${t.common.months[d.getUTCMonth()]}`;
}

export interface MonthGroup<T> {
  key: string; // "2026-09"
  title: string; // "September 2026"
  trips: T[];
  distanceM: number;
}

/** Newest first, grouped by IST month. */
export function groupByMonth<T extends HistoryTrip>(trips: T[]): MonthGroup<T>[] {
  const sorted = trips.slice().sort((a, b) => Date.parse(tripDate(b)) - Date.parse(tripDate(a)));
  const groups: MonthGroup<T>[] = [];
  for (const trip of sorted) {
    const d = ist(tripDate(trip));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    let g = groups.at(-1);
    if (!g || g.key !== key) {
      g = {
        key,
        title: `${t.common.monthsLong[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
        trips: [],
        distanceM: 0,
      };
      groups.push(g);
    }
    g.trips.push(trip);
    if (historyStatus(trip.status) === 'verified') g.distanceM += trip.tracked_distance_m ?? 0;
  }
  return groups;
}

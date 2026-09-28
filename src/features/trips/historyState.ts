/**
 * D7 Trip History rules (M11, docs/12 D7).
 *
 * Three things happen on this screen and none of them belong in a render: the
 * status filter, the month grouping and the summary strip. They are pure
 * functions here so the boundaries are testable — a trip that ended at 23:59 on
 * the 31st belongs in the month it *ended*, and a filter must not change the
 * counts the strip shows.
 *
 * `assigned` trips are not history. A trip that has not started is on D3, where
 * the driver acts on it; listing it here would suggest it had already happened.
 */
import type { TripStatus } from "@/theme/status";

/** doc 12 D7: "All, Verified, Under review, Not verified". */
export const HISTORY_FILTERS = ["all", "verified", "needs_review", "rejected"] as const;
export type HistoryFilter = (typeof HISTORY_FILTERS)[number];

/** One row of the D7 list. */
export type HistoryRow = {
  id: string;
  loadCode: string;
  pickupAddress: string;
  dropAddress: string;
  status: TripStatus;
  startedAt: string | null;
  endedAt: string | null;
  /** Official km from `verify_trip`; null until the trip is verified. */
  trackedDistanceKm: number | null;
};

/** True when a trip belongs in the history list at all. */
export function isHistoryRow(status: TripStatus): boolean {
  return status !== "assigned";
}

export function matchesFilter(status: TripStatus, filter: HistoryFilter): boolean {
  if (!isHistoryRow(status)) {
    return false;
  }
  if (filter === "all") {
    return true;
  }
  return status === filter;
}

/**
 * Pure: the month a trip belongs to, from when it ended.
 *
 * A trip that has not ended yet falls back to its start, and a trip with
 * neither (assigned, which never reaches here) sorts last rather than throwing.
 */
export function monthKeyOf(iso: string | null): { year: number; month: number } | null {
  if (iso === null) {
    return null;
  }
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) {
    return null;
  }
  const date = new Date(at);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** Newest first; undated rows last. */
export function sortHistory(rows: readonly HistoryRow[]): HistoryRow[] {
  return [...rows].sort((a, b) => {
    const atA = Date.parse(a.endedAt ?? a.startedAt ?? "");
    const atB = Date.parse(b.endedAt ?? b.startedAt ?? "");
    const validA = Number.isFinite(atA);
    const validB = Number.isFinite(atB);
    if (validA !== validB) {
      return validA ? -1 : 1;
    }
    if (validA && validB && atA !== atB) {
      return atB - atA;
    }
    return a.id.localeCompare(b.id);
  });
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export type HistoryMonth = {
  /** `2026-09` — stable key for the section header and for tests. */
  key: string;
  label: string;
  rows: HistoryRow[];
};

/**
 * Pure: group filtered rows into month sections, newest month first.
 *
 * Month names are a hand-rolled English table for the same reason D6's date
 * formatter is: Hermes has no full ICU data, so `toLocaleDateString` cannot be
 * trusted to produce the same string on Android, iOS and web. M12a localises
 * these with the rest of the copy.
 */
export function groupByMonth(rows: readonly HistoryRow[], filter: HistoryFilter): HistoryMonth[] {
  const months = new Map<string, HistoryMonth>();

  for (const row of sortHistory(rows)) {
    if (!matchesFilter(row.status, filter)) {
      continue;
    }
    const when = monthKeyOf(row.endedAt ?? row.startedAt);
    const key =
      when === null
        ? "undated"
        : `${String(when.year).padStart(4, "0")}-${String(when.month + 1).padStart(2, "0")}`;
    const existing = months.get(key);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    months.set(key, {
      key,
      label:
        when === null ? "—" : `${MONTH_NAMES[when.month] ?? MONTH_NAMES[0]} ${String(when.year)}`,
      rows: [row],
    });
  }

  return [...months.values()].sort((a, b) => b.key.localeCompare(a.key));
}

export type HistorySummary = {
  verified: number;
  needsReview: number;
  rejected: number;
};

/**
 * Pure: the strip above the list — "38 verified · 2 under review".
 *
 * Counted over the rows before filtering, so the strip is a statement about the
 * driver's record rather than about whatever tab is open.
 */
export function historySummary(rows: readonly HistoryRow[]): HistorySummary {
  let verified = 0;
  let needsReview = 0;
  let rejected = 0;
  for (const row of rows) {
    if (row.status === "verified") {
      verified += 1;
    } else if (row.status === "needs_review") {
      needsReview += 1;
    } else if (row.status === "rejected") {
      rejected += 1;
    }
  }
  return { verified, needsReview, rejected };
}

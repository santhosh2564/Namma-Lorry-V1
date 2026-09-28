/**
 * The D6 Trip Summary derivations (M10, docs/12 D6, docs/08 §3).
 *
 * After End, a trip is one of five things to the driver: still checking, ended
 * offline and waiting to sync, verified, under review with reasons, or not
 * verified. Mapping a database status onto that story — and turning the
 * verifier's reason codes into sentences — is pure logic, so it lives here
 * rather than inside the screen.
 *
 * The reason codes are the ten from docs/08 §3 and they are deliberately **not**
 * re-worded in this module: each one maps to a translation key, and the English
 * text in `src/i18n/en.json` is copied from the doc's "driver-facing text"
 * column. A code the app has never heard of (a Phase 2 addition) falls back to a
 * neutral sentence instead of rendering a raw code at the driver.
 */
import type { Json, TripStatus, VerificationReason } from "@/lib/database.types";
import { VERIFICATION_REASONS } from "@/lib/database.types";

export type SummaryVariant =
  "verifying" | "pending_sync" | "verified" | "needs_review" | "rejected" | "cancelled";

/**
 * Pure: the variant D6 renders.
 *
 * `completed` means "the server has the trip but `verify_trip` has not run yet"
 * — either the last points are still arriving, or the end happened offline and
 * the uploader has not caught up (`offlineEnded`). `assigned` / `in_progress`
 * should not reach D6 at all; they fall back to the neutral "checking" story,
 * which is true and never alarming.
 */
export function summaryVariant(status: TripStatus, offlineEnded: boolean): SummaryVariant {
  switch (status) {
    case "completed":
      return offlineEnded ? "pending_sync" : "verifying";
    case "verified":
    case "needs_review":
    case "rejected":
    case "cancelled":
      return status;
    default:
      return "verifying";
  }
}

/** Pure: is this one of the ten codes Postgres can send? */
export function isVerificationReason(code: string): code is VerificationReason {
  return (VERIFICATION_REASONS as readonly string[]).includes(code);
}

/** Pure: reason code → translation key (never a raw code in the UI). */
export function reasonKey(code: string): string {
  return isVerificationReason(code)
    ? `driver.summary.reasons.${code}`
    : "driver.summary.reasons.unknown";
}

/** Pure: the reason list, de-duplicated and with unknowns collapsed. */
export function reasonKeys(reasons: readonly string[]): string[] {
  const keys: string[] = [];
  for (const code of reasons) {
    const key = reasonKey(code);
    if (!keys.includes(key)) {
      keys.push(key);
    }
  }
  return keys;
}

export type SummaryMetrics = {
  /** Metres the end position was from the drop centre, when measured. */
  endDistanceM: number | null;
  /** Metres the start position was from the pickup centre, when measured. */
  startDistanceM: number | null;
  /** Tracked ÷ planned, when the load had a planned distance. */
  plannedRatio: number | null;
};

export const EMPTY_METRICS: SummaryMetrics = {
  endDistanceM: null,
  startDistanceM: null,
  plannedRatio: null,
};

function metricNumber(metrics: Json | null, key: string): number | null {
  if (metrics === null || typeof metrics !== "object" || Array.isArray(metrics)) {
    return null;
  }
  const value = (metrics as Record<string, Json | undefined>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Pure: read `verification_metrics` (written by `verify_trip`, docs/08 §3).
 * Missing or malformed values read as null — a reason without a distance still
 * renders, just without the "(1.8 km away)" detail.
 */
export function readMetrics(metrics: Json | null): SummaryMetrics {
  return {
    endDistanceM: metricNumber(metrics, "end_distance_m"),
    startDistanceM: metricNumber(metrics, "start_distance_m"),
    plannedRatio: metricNumber(metrics, "planned_ratio"),
  };
}

/**
 * Pure: the metres to show next to a reason, when the reason has a distance.
 * `END_OUTSIDE_DROP` and `START_OUTSIDE_PICKUP` are the only two the verifier
 * measures; the rest are counts and ratios the driver cannot act on.
 */
export function reasonDistanceM(code: string, metrics: SummaryMetrics): number | null {
  if (code === "END_OUTSIDE_DROP") {
    return metrics.endDistanceM;
  }
  if (code === "START_OUTSIDE_PICKUP") {
    return metrics.startDistanceM;
  }
  return null;
}

/** Pure: metres → whole kilometres, or null. */
export function kmFromMetres(metres: number | null): number | null {
  return metres === null ? null : Math.round(metres / 1000);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Pure: `"26 Sep 2026"` (the design's route-summary line).
 *
 * Hand-rolled rather than `toLocaleDateString`, because Hermes ships without
 * full ICU data — the same string must render on Android, iOS and web.
 */
export function formatTripDate(iso: string | null): string | null {
  if (iso === null) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Pure: thousands-separated whole number — "14,860". */
export function formatCount(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

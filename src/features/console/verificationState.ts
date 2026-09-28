/**
 * C6 verification metrics (M11, docs/12 C6, docs/08 §3).
 *
 * `verify_trip` writes `verification_metrics` as a jsonb blob: the measurements
 * behind the decision, not a display string. This module reads it defensively —
 * a missing, null or wrongly-typed field reads as null and simply is not shown,
 * because a trip verified by an older build of the function must still render.
 *
 * The numbers are shown, never recomputed. `tracked_distance_m` is the official
 * distance; the grid beside it is the evidence the verifier used, and the
 * console has no business deriving a fourth opinion (CLAUDE.md rule 1).
 *
 * Reason text reuses the driver-facing sentences from D6
 * (`driver.summary.reasons.*`): docs/12 asks the console for the same
 * plain-language reasons in plain language, and having one sentence per code
 * means a driver and an operator are never told two different stories about the
 * same flag.
 */
import { formatCount, reasonDistanceParts, reasonKey } from "@/features/trips/summaryState";
import type { ReasonDistance } from "@/features/trips/summaryState";
import type { Json } from "@/lib/database.types";

export type VerificationMetrics = {
  /** Points the verifier counted (every row, mocked included). */
  points: number | null;
  mocked: number | null;
  /** Segments over the plausible-speed threshold. */
  jumps: number | null;
  /** Longest gap between consecutive points, seconds. */
  maxGapS: number | null;
  avgKmh: number | null;
  /** Tracked ÷ planned distance. */
  plannedRatio: number | null;
  startDistanceM: number | null;
  endDistanceM: number | null;
};

export const EMPTY_VERIFICATION_METRICS: VerificationMetrics = {
  points: null,
  mocked: null,
  jumps: null,
  maxGapS: null,
  avgKmh: null,
  plannedRatio: null,
  startDistanceM: null,
  endDistanceM: null,
};

function number(metrics: Record<string, Json | undefined>, key: string): number | null {
  const value = metrics[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

/** Pure: read the blob. Unknown shapes read as null rather than throwing. */
export function readVerificationMetrics(metrics: Json | null): VerificationMetrics {
  if (metrics === null || typeof metrics !== "object" || Array.isArray(metrics)) {
    return EMPTY_VERIFICATION_METRICS;
  }
  const row = metrics as Record<string, Json | undefined>;
  return {
    points: number(row, "points"),
    mocked: number(row, "mocked"),
    jumps: number(row, "jumps"),
    maxGapS: number(row, "max_gap_s"),
    avgKmh: number(row, "avg_kmh"),
    plannedRatio: number(row, "planned_ratio"),
    startDistanceM: number(row, "start_distance_m"),
    endDistanceM: number(row, "end_distance_m"),
  };
}

export type MetricCell = {
  key: "points" | "maxGap" | "avgSpeed" | "plannedRatio" | "mocked";
  labelKey: string;
  /** Already formatted, or null when the verifier did not measure it. */
  value: string | null;
};

/** Pure: `"4 min"`, or null. The longest gap is the one an operator looks for. */
export function formatMaxGap(seconds: number | null): string | null {
  if (seconds === null) {
    return null;
  }
  return `${Math.max(0, Math.round(seconds / 60))} min`;
}

/**
 * Pure: the metrics grid (docs/12 C6: "points · max gap · avg speed ·
 * planned ratio · mocked").
 *
 * A cell with no measurement is dropped rather than shown as a zero: "0 mocked"
 * and "we do not know" are very different claims, and a trip the verifier has
 * not measured yet must not read as one with no points.
 */
export function metricsGrid(metrics: VerificationMetrics): MetricCell[] {
  const cells: MetricCell[] = [
    {
      key: "points",
      labelKey: "console.trip.metricPoints",
      value: metrics.points === null ? null : formatCount(metrics.points),
    },
    { key: "maxGap", labelKey: "console.trip.metricMaxGap", value: formatMaxGap(metrics.maxGapS) },
    {
      key: "avgSpeed",
      labelKey: "console.trip.metricAvgSpeed",
      value: metrics.avgKmh === null ? null : `${metrics.avgKmh} km/h`,
    },
    {
      key: "plannedRatio",
      labelKey: "console.trip.metricPlannedRatio",
      value: metrics.plannedRatio === null ? null : String(metrics.plannedRatio),
    },
    {
      key: "mocked",
      labelKey: "console.trip.metricMocked",
      value: metrics.mocked === null ? null : formatCount(metrics.mocked),
    },
  ];
  return cells.filter((cell) => cell.value !== null);
}

/**
 * Pure: the distance shown beside a geofence reason.
 *
 * Metres below a kilometre, kilometres above — see `reasonDistanceParts` in
 * summaryState, which the driver app's D6 uses for the same sentence.
 */

export type ReasonChip = {
  code: string;
  /** Translation key for the plain-language sentence (never the raw code). */
  sentenceKey: string;
  /** Only the two geofence reasons have a distance the verifier measured. */
  distance: ReasonDistance | null;
};

/**
 * Pure: the reason chips (docs/12 C6: "END_OUTSIDE_DROP · ended 1.8 km from
 * drop").
 *
 * The chip shows the code, because an operator cross-checking against
 * `verification_reasons` in the database needs to see the same string; the
 * sentence under it is what the driver was told.
 */
export function reasonChips(codes: readonly string[], metrics: VerificationMetrics): ReasonChip[] {
  return codes.map((code) => ({
    code,
    sentenceKey: reasonKey(code),
    distance: reasonDistanceParts(
      code === "END_OUTSIDE_DROP"
        ? metrics.endDistanceM
        : code === "START_OUTSIDE_PICKUP"
          ? metrics.startDistanceM
          : null,
    ),
  }));
}

/**
 * Pure: the distance sentence for a chip, or null when there is none.
 *
 * Returns the *key* rather than the string so each surface keeps its own
 * wording (the console says "(1.8 km away)", the driver app "1.8 km away").
 */
export function reasonDistanceKey(distance: ReasonDistance | null): {
  key: string;
  values: { km: string } | { m: string };
} | null {
  if (distance === null) {
    return null;
  }
  return distance.unit === "m"
    ? { key: "console.trip.reasonDistanceM", values: { m: distance.amount } }
    : { key: "console.trip.reasonDistance", values: { km: distance.amount } };
}

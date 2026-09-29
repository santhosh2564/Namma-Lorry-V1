/**
 * Typed tracking errors (M8, docs/06 §1).
 *
 * The RPCs fail with `raise exception '<CODE>'` (or `'OUTSIDE_PICKUP:%'`), which
 * supabase-js surfaces as `error.message`. Screens must branch on a code rather
 * than on a string, so the raw failure is parsed once, here, into a shape the
 * state machine and (from M9) the D4 start button can switch on.
 */
export type TrackingErrorCode =
  /** Not this driver's trip, or it no longer exists. */
  | "TRIP_NOT_FOUND"
  /** The trip is not in `assigned` any more — refresh the list. */
  | "TRIP_NOT_STARTABLE"
  /** Another trip is already `in_progress` for this driver. */
  | "ANOTHER_TRIP_ACTIVE"
  /** `start_trip` judged the fix too coarse (`max_point_accuracy_m`). */
  | "GPS_ACCURACY_TOO_LOW"
  /** Too far from the pickup centre; `outsidePickupM` carries the distance. */
  | "OUTSIDE_PICKUP"
  /** `end_trip` found the trip already ended — treat as success. */
  | "TRIP_NOT_ACTIVE"
  /** `start_trip`: the driver has no recorded consent (0006, docs/09 §1). */
  | "CONSENT_REQUIRED"
  /** Client-side: no usable GPS fix, so the RPC was never called. */
  | "GPS_UNAVAILABLE"
  /** The request never reached the server (offline, DNS, timeout). */
  | "NETWORK"
  /** Supabase is not configured in this build. */
  | "NOT_CONFIGURED"
  | "UNKNOWN";

export type TrackingError = {
  code: TrackingErrorCode;
  /** The raw upstream message, kept for logs. Never rendered verbatim. */
  message: string;
  /** Metres from the pickup centre. Only set for `OUTSIDE_PICKUP`. */
  outsidePickupM?: number;
};

/** The codes Postgres can raise, in the order we test for them. */
const RPC_CODES: readonly Exclude<TrackingErrorCode, "OUTSIDE_PICKUP" | "GPS_UNAVAILABLE">[] = [
  "TRIP_NOT_FOUND",
  "TRIP_NOT_STARTABLE",
  "ANOTHER_TRIP_ACTIVE",
  "GPS_ACCURACY_TOO_LOW",
  "TRIP_NOT_ACTIVE",
  "CONSENT_REQUIRED",
];

/**
 * Phrases supabase-js / fetch produce when nothing reached the server. Matching
 * on text is ugly, but it is the only signal available: a failed `fetch` and a
 * PostgREST error both arrive as a rejected promise with a message.
 */
const NETWORK_PHRASES = [
  "network request failed",
  "failed to fetch",
  "fetch failed",
  "networkerror",
  "network error",
  "timeout",
  "timed out",
  "econnrefused",
  "econnreset",
  "enotfound",
  "socket hang up",
];

/** Pull a message string out of whatever the client threw. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === "string") {
      return candidate;
    }
    const nested = (error as { error_description?: unknown }).error_description;
    if (typeof nested === "string") {
      return nested;
    }
  }
  return "";
}

export function isNetworkError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return NETWORK_PHRASES.some((phrase) => message.includes(phrase));
}

/**
 * Parse any failure from `start_trip` / `end_trip` into a typed error.
 *
 * `OUTSIDE_PICKUP:<metres>` is the one code carrying data: the SQL does
 * `raise exception 'OUTSIDE_PICKUP:%', round(v_d)`, so the distance is the text
 * after the colon and is parsed back to a number here.
 */
export function parseTrackingError(error: unknown): TrackingError {
  const message = errorMessage(error);
  const trimmed = message.trim();

  const outside = /OUTSIDE_PICKUP\s*:\s*([0-9]+(?:\.[0-9]+)?)/i.exec(trimmed);
  if (outside) {
    const metres = Number(outside[1]);
    return {
      code: "OUTSIDE_PICKUP",
      message: trimmed,
      outsidePickupM: Number.isFinite(metres) ? Math.round(metres) : undefined,
    };
  }

  for (const code of RPC_CODES) {
    if (trimmed.includes(code)) {
      return { code, message: trimmed };
    }
  }

  if (isNetworkError(error)) {
    return { code: "NETWORK", message: trimmed };
  }

  if (trimmed === "") {
    return { code: "UNKNOWN", message: "Unknown tracking failure" };
  }

  return { code: "UNKNOWN", message: trimmed };
}

/** A client-side error that never reached an RPC. */
export function gpsUnavailable(): TrackingError {
  return { code: "GPS_UNAVAILABLE", message: "No GPS fix was available" };
}

export function notConfiguredError(): TrackingError {
  return { code: "NOT_CONFIGURED", message: "Supabase is not configured" };
}

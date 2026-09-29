/**
 * The D4 start-button state machine (M9, docs/12 D4).
 *
 * The screen watches the GPS fix while it is open and derives one of six
 * states from (fix, permissions, distance). That derivation is pure and lives
 * here so every boundary is unit-testable — including the two easy to get
 * wrong:
 *
 * - **Accuracy outranks distance.** A 40 m fix at 100 m from the pickup is
 *   "waiting for GPS", not "outside the radius": the driver would otherwise
 *   pace away from a gate they are standing at because a cold fix guessed.
 *   The server applies the same order in `start_trip` (accuracy check first,
 *   docs/06 §1).
 * - **The radius is the server's.** `d <= radius` uses the load's own
 *   `pickup_radius_m`, exactly what the RPC re-checks; the client shows the
 *   verdict the server will hand down so the button never lies.
 */
import { haversineMetres } from "@/lib/geo";
import type { TrackingError, TrackingErrorCode } from "@/tracking/errors";
import { accuracyIsAcceptable } from "@/tracking/permissions";

export type StartState = "no_fix" | "gps_weak" | "outside_radius" | "ready" | "starting" | "error";

export type StartStateInput = {
  /** Latest fix, or null while none has arrived. */
  fix: { lat: number; lng: number; accuracyM: number | null } | null;
  /** Both location grants (foreground + background). */
  permissionsOk: boolean;
  /** The load's pickup geofence. */
  pickup: { lat: number; lng: number; radiusM: number };
  /** True once the driver has tapped START and the RPC is in flight. */
  starting: boolean;
  /** An RPC failure to display (state "error"). */
  error: string | null;
};

/**
 * Distance from the fix to the pickup centre, or null without a fix. Exported
 * because the screen shows the metres in the outside-radius banner.
 */
export function distanceToPickupM(
  fix: { lat: number; lng: number } | null,
  pickup: { lat: number; lng: number },
): number | null {
  if (fix === null) {
    return null;
  }
  return Math.round(haversineMetres(fix, pickup));
}

/** Pure: the state the D4 bottom sheet should render. */
export function startState(input: StartStateInput): StartState {
  if (input.starting) {
    return "starting";
  }
  if (input.error !== null) {
    return "error";
  }
  if (!input.permissionsOk) {
    return "no_fix";
  }
  if (input.fix === null) {
    return "no_fix";
  }
  if (!accuracyIsAcceptable(input.fix.accuracyM)) {
    return "gps_weak";
  }
  const distance = distanceToPickupM(input.fix, input.pickup);
  if (distance === null || distance > input.pickup.radiusM) {
    return "outside_radius";
  }
  return "ready";
}

/** Pure: is the START button pressable in this state? */
export function startEnabled(state: StartState): boolean {
  return state === "ready";
}

const START_ERROR_KEYS: Record<TrackingErrorCode, string> = {
  TRIP_NOT_FOUND: "notFound",
  TRIP_NOT_STARTABLE: "notStartable",
  ANOTHER_TRIP_ACTIVE: "anotherActive",
  GPS_ACCURACY_TOO_LOW: "gpsWeak",
  OUTSIDE_PICKUP: "outsidePickup",
  TRIP_NOT_ACTIVE: "notActive",
  CONSENT_REQUIRED: "consentRequired",
  GPS_UNAVAILABLE: "noGps",
  NETWORK: "network",
  NOT_CONFIGURED: "notConfigured",
  UNKNOWN: "unknown",
};

export type StartErrorText = {
  /** i18n key under `driver.trip.errors`. */
  key: string;
  params?: { km: number };
  /** CONSENT_REQUIRED: offer the D1 notice again instead of a plain retry. */
  reviewConsent: boolean;
};

/**
 * Pure: the driver-facing text for a failed START (docs/06 §1 "App shows").
 * The upstream message is for logs only and is never rendered.
 */
export function startErrorText(error: TrackingError): StartErrorText {
  const key = `driver.trip.errors.${START_ERROR_KEYS[error.code]}`;
  if (error.code === "OUTSIDE_PICKUP" && error.outsidePickupM !== undefined) {
    return {
      key,
      params: { km: Math.round(error.outsidePickupM / 100) / 10 },
      reviewConsent: false,
    };
  }
  return { key, reviewConsent: error.code === "CONSENT_REQUIRED" };
}

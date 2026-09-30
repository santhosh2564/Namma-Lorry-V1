/**
 * Root routing decision (M5, docs/04 §2).
 *
 * The whole app-start flow is one pure function so every branch is unit
 * testable without a renderer: no imports of React Native, Supabase or the
 * router, only types. `routePath` is the single place that maps a decision
 * onto a route, so the screens never build hrefs by hand.
 *
 * docs/04 §2:
 *   active trip in local DB? -> restart the location task, go to Active Trip
 *   else session?             -> no: Sign in
 *   else profile.role         -> driver + web: "use the mobile app"
 *                               driver + native: permissions? onboarding : trips
 *                               admin: console
 *                               owner/shipper: "coming soon"
 *
 * Two states the flowchart does not draw, because they are real in the database
 * (`profiles.is_active`, and a session with no profile row) and doc 12 S4 lists
 * them as notice variants:
 *   - a deactivated account is refused before the role is read;
 *   - a signed-in user with no profile row gets a "not set up" notice instead
 *     of a screen that would crash on a null role.
 */
import type { Href } from "expo-router";

import type { UserRole } from "@/lib/database.types";
import { SCREENS } from "@/lib/screens";

/** The platforms that matter to the gate. `web` never runs trips (TRD §4.4). */
export type AppPlatform = "ios" | "android" | "web";

/** Session lifecycle as tracked by the auth store. */
export type SessionStatus = "initialising" | "signed_out" | "signed_in";

/** The four S4 message variants. The first three are doc 12's. */
export type AccessNoticeVariant = "driver_on_web" | "coming_soon" | "deactivated" | "no_profile";

const ACCESS_NOTICE_VARIANTS: readonly AccessNoticeVariant[] = [
  "driver_on_web",
  "coming_soon",
  "deactivated",
  "no_profile",
];

/**
 * Validate the `?variant=` query string S4 is opened with. Anything unknown
 * returns null so the route falls back to the splash gate instead of guessing
 * a message for a user it does not understand.
 */
export function parseAccessNoticeVariant(value: unknown): AccessNoticeVariant | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return ACCESS_NOTICE_VARIANTS.find((variant) => variant === raw) ?? null;
}

/** The slice of `profiles` the gate needs. */
export type AuthProfile = {
  id: string;
  role: UserRole;
  isActive: boolean;
  /** Shown by the console's account menu (M6); the gate never reads it. */
  fullName: string;
  /**
   * Whether background location + notifications are granted. M9 owns the real
   * check (it lives in the permission screen); M5 keeps the field so the
   * onboarding branch is already wired and testable.
   */
  permissionsGranted: boolean;
  /** The policy version the driver last agreed to on D1, or null (docs/09 §1). */
  consentVersion: string | null;
};

export type RouteInput = {
  session: SessionStatus;
  platform: AppPlatform;
  /** Null until the profile query settles (or if it errored). */
  profile: AuthProfile | null;
  /** False while the profile query is still in flight. */
  profileSettled: boolean;
  /** Trip the phone was recording when the app was closed, or null. */
  activeTripId: string | null;
  /** The policy version this build's D1 notice stands for (CONSENT_VERSION). */
  consentVersion: string;
};

export type RouteDecision =
  | { destination: "splash" }
  | { destination: "sign_in" }
  | { destination: "active_trip"; tripId: string }
  | { destination: "onboarding" }
  | { destination: "driver_home" }
  | { destination: "console" }
  | { destination: "access_notice"; variant: AccessNoticeVariant };

/**
 * Decide where the app goes from here. Pure: same input, same output, no I/O.
 */
export function decideRoute(input: RouteInput): RouteDecision {
  const { session, platform, profile, profileSettled, activeTripId } = input;

  // Still finding out who the user is — stay on the splash.
  if (session === "initialising") {
    return { destination: "splash" };
  }

  // An unfinished trip outranks everything: the driver has to be able to reach
  // Active Trip to end it, whatever the account state says (docs/04 §2).
  if (activeTripId !== null) {
    return { destination: "active_trip", tripId: activeTripId };
  }

  if (session === "signed_out") {
    return { destination: "sign_in" };
  }

  // Signed in but the profile has not arrived yet.
  if (profile === null) {
    return profileSettled
      ? { destination: "access_notice", variant: "no_profile" }
      : { destination: "splash" };
  }

  // A deactivated account never reaches a product screen.
  if (!profile.isActive) {
    return { destination: "access_notice", variant: "deactivated" };
  }

  switch (profile.role) {
    case "admin":
      return { destination: "console" };
    case "driver":
      if (platform === "web") {
        return { destination: "access_notice", variant: "driver_on_web" };
      }
      return profile.permissionsGranted
        ? { destination: "driver_home" }
        : { destination: "onboarding" };
    case "owner":
    case "shipper":
      return { destination: "access_notice", variant: "coming_soon" };
  }
}

/** The route a decision navigates to. Typed as expo-router's `Href`. */
export function routePath(decision: RouteDecision): Href {
  switch (decision.destination) {
    case "splash":
      return SCREENS.S1.route as Href;
    case "sign_in":
      return SCREENS.S2.route as Href;
    case "active_trip":
      return {
        pathname: SCREENS.D5.route,
        params: { id: decision.tripId },
      } as Href;
    case "onboarding":
      return SCREENS.D1.route as Href;
    case "driver_home":
      return SCREENS.D3.route as Href;
    case "console":
      return SCREENS.C1.route as Href;
    case "access_notice":
      // The variant travels in the query string so a reload (or a shared
      // link) shows the same notice instead of a default.
      return {
        pathname: SCREENS.S4.route,
        params: { variant: decision.variant },
      } as Href;
  }
}

/** Why a sign-out is refused, or null when it is allowed (doc 12, D8). */
export type SignOutBlockReason = "trip_active";

/**
 * Sign-out is blocked while a trip is being recorded: the driver would lose
 * the ability to end it and the phone would keep tracking for an account that
 * no longer has a session. M8 replaces the stub flag with the real local
 * tracking state; the decision lives here so it stays testable.
 */
export function signOutBlockReason(input: {
  activeTripId: string | null;
}): SignOutBlockReason | null {
  return input.activeTripId === null ? null : "trip_active";
}

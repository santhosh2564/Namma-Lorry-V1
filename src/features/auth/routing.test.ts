/**
 * Routing gate tests (M5).
 *
 * `decideRoute` is pure, so the whole of docs/04 §2 is verified here without a
 * renderer: every role × platform combination, both account states, and the
 * states that outrank the role gate.
 */
import {
  type AppPlatform,
  type AccessNoticeVariant,
  type AuthProfile,
  type RouteInput,
  decideRoute,
  parseAccessNoticeVariant,
  routePath,
  signOutBlockReason,
} from "@/features/auth/routing";
import { CONSENT_VERSION } from "@/features/onboarding/consent";
import type { UserRole } from "@/lib/database.types";

const ALL_ROLES: UserRole[] = ["driver", "owner", "shipper", "admin"];
const ALL_PLATFORMS: AppPlatform[] = ["ios", "android", "web"];

function profile(overrides: Partial<AuthProfile> = {}): AuthProfile {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    role: "driver",
    isActive: true,
    fullName: "Murugan S",
    permissionsGranted: true,
    consentVersion: CONSENT_VERSION,
    ...overrides,
  };
}

function input(overrides: Partial<RouteInput> = {}): RouteInput {
  return {
    session: "signed_in",
    platform: "android",
    profile: profile(),
    profileSettled: true,
    activeTripId: null,
    requiredConsentVersion: CONSENT_VERSION,
    ...overrides,
  };
}

describe("decideRoute — session states", () => {
  it("stays on the splash while the session is still being resolved", () => {
    expect(
      decideRoute(
        input({
          session: "initialising",
          profile: null,
          profileSettled: false,
        }),
      ),
    ).toEqual({ destination: "splash" });
  });

  it("sends a signed-out user to sign in", () => {
    expect(
      decideRoute(
        input({
          session: "signed_out",
          profile: null,
          profileSettled: false,
        }),
      ),
    ).toEqual({ destination: "sign_in" });
  });

  it("stays on the splash while the profile query is in flight", () => {
    expect(decideRoute(input({ profile: null, profileSettled: false }))).toEqual({
      destination: "splash",
    });
  });

  it("shows the S4 'not set up' notice when a session has no profile row", () => {
    expect(decideRoute(input({ profile: null, profileSettled: true }))).toEqual({
      destination: "access_notice",
      variant: "no_profile",
    });
  });
});

describe("decideRoute — every role × platform", () => {
  const expected: Record<
    UserRole,
    Record<AppPlatform, { destination: string; variant?: AccessNoticeVariant }>
  > = {
    // Driver runs trips on the phone only; on web it is told to use the app.
    driver: {
      ios: { destination: "driver_home" },
      android: { destination: "driver_home" },
      web: { destination: "access_notice", variant: "driver_on_web" },
    },
    // Owners and shippers exist in the database but are Phase 2 (ND-10).
    owner: {
      ios: { destination: "access_notice", variant: "coming_soon" },
      android: { destination: "access_notice", variant: "coming_soon" },
      web: { destination: "access_notice", variant: "coming_soon" },
    },
    shipper: {
      ios: { destination: "access_notice", variant: "coming_soon" },
      android: { destination: "access_notice", variant: "coming_soon" },
      web: { destination: "access_notice", variant: "coming_soon" },
    },
    // The console is the admin's home, on web and on the phone (docs/04 §2).
    admin: {
      ios: { destination: "console" },
      android: { destination: "console" },
      web: { destination: "console" },
    },
  };

  for (const role of ALL_ROLES) {
    for (const platform of ALL_PLATFORMS) {
      it(`routes an active ${role} on ${platform}`, () => {
        const decision = decideRoute(input({ platform, profile: profile({ role }) }));
        expect(decision.destination).toBe(expected[role][platform].destination);
        if (expected[role][platform].variant) {
          expect(decision).toMatchObject({ variant: expected[role][platform].variant });
        }
      });
    }
  }

  it("covers every role and platform combination", () => {
    expect(ALL_ROLES).toHaveLength(4);
    expect(ALL_PLATFORMS).toHaveLength(3);
    expect(ALL_ROLES.length * ALL_PLATFORMS.length).toBe(12);
  });
});

describe("decideRoute — re-consent (0009)", () => {
  it("sends a driver whose recorded consent is stale back to D1", () => {
    expect(decideRoute(input({ profile: profile({ consentVersion: "2025-01-01" }) }))).toEqual({
      destination: "onboarding",
    });
  });

  it("sends a driver who has never consented back to D1", () => {
    expect(decideRoute(input({ profile: profile({ consentVersion: null }) }))).toEqual({
      destination: "onboarding",
    });
  });

  it("lets a driver who already agreed to this build's version straight through", () => {
    expect(decideRoute(input({ profile: profile({ consentVersion: CONSENT_VERSION }) }))).toEqual({
      destination: "driver_home",
    });
  });

  it("does not gate admins", () => {
    for (const platform of ALL_PLATFORMS) {
      expect(
        decideRoute(input({ platform, profile: profile({ role: "admin", consentVersion: null }) })),
      ).toEqual({ destination: "console" });
    }
  });

  it("does not gate a driver on web, who is told to use the app instead", () => {
    expect(
      decideRoute(input({ platform: "web", profile: profile({ consentVersion: null }) })),
    ).toEqual({ destination: "access_notice", variant: "driver_on_web" });
  });
});

describe("decideRoute — account state", () => {
  it("refuses a deactivated account before reading the role", () => {
    for (const role of ALL_ROLES) {
      for (const platform of ALL_PLATFORMS) {
        expect(
          decideRoute(input({ platform, profile: profile({ role, isActive: false }) })),
        ).toEqual({ destination: "access_notice", variant: "deactivated" });
      }
    }
  });

  it("sends a native driver without permissions into onboarding", () => {
    for (const platform of ["ios", "android"] as const) {
      expect(
        decideRoute(input({ platform, profile: profile({ permissionsGranted: false }) })),
      ).toEqual({ destination: "onboarding" });
    }
  });

  it("does not send a driver on web through onboarding, because there is no app to onboard into", () => {
    expect(
      decideRoute(input({ platform: "web", profile: profile({ permissionsGranted: false }) })),
    ).toEqual({ destination: "access_notice", variant: "driver_on_web" });
  });
});

describe("decideRoute — active trip outranks everything", () => {
  it("resumes the trip for a signed-in driver", () => {
    expect(decideRoute(input({ activeTripId: "trip-1" }))).toEqual({
      destination: "active_trip",
      tripId: "trip-1",
    });
  });

  it("resumes the trip even for a deactivated account, so the trip can be ended", () => {
    expect(
      decideRoute(
        input({ activeTripId: "trip-1", profile: profile({ isActive: false, role: "admin" }) }),
      ),
    ).toEqual({ destination: "active_trip", tripId: "trip-1" });
  });

  it("resumes the trip even when the session has expired mid-trip", () => {
    expect(
      decideRoute(
        input({
          session: "signed_out",
          profile: null,
          profileSettled: false,
          activeTripId: "trip-1",
        }),
      ),
    ).toEqual({ destination: "active_trip", tripId: "trip-1" });
  });

  it("resumes the trip ahead of a stale consent, so it can still be ended", () => {
    expect(
      decideRoute(input({ activeTripId: "trip-1", profile: profile({ consentVersion: null }) })),
    ).toEqual({ destination: "active_trip", tripId: "trip-1" });
  });
});

describe("routePath", () => {
  it("maps every destination onto its route", () => {
    expect(routePath({ destination: "splash" })).toBe("/");
    expect(routePath({ destination: "sign_in" })).toBe("/(auth)/sign-in");
    expect(routePath({ destination: "onboarding" })).toBe("/(onboarding)/permissions");
    expect(routePath({ destination: "driver_home" })).toBe("/(driver)");
    expect(routePath({ destination: "console" })).toBe("/(console)");
  });

  it("carries the trip id into Active Trip", () => {
    expect(routePath({ destination: "active_trip", tripId: "trip-1" })).toEqual({
      pathname: "/(driver)/trips/[id]/live",
      params: { id: "trip-1" },
    });
  });

  it("carries the notice variant into S4", () => {
    expect(routePath({ destination: "access_notice", variant: "deactivated" })).toEqual({
      pathname: "/access-notice",
      params: { variant: "deactivated" },
    });
  });
});

describe("parseAccessNoticeVariant", () => {
  it("accepts every variant the gate can produce", () => {
    const variants: AccessNoticeVariant[] = [
      "driver_on_web",
      "coming_soon",
      "deactivated",
      "no_profile",
    ];
    for (const variant of variants) {
      expect(parseAccessNoticeVariant(variant)).toBe(variant);
    }
  });

  it("rejects anything else so the screen falls back to the gate", () => {
    expect(parseAccessNoticeVariant(undefined)).toBeNull();
    expect(parseAccessNoticeVariant("")).toBeNull();
    expect(parseAccessNoticeVariant("../../etc/passwd")).toBeNull();
    expect(parseAccessNoticeVariant(["deactivated", "coming_soon"])).toBe("deactivated");
  });
});

describe("signOutBlockReason", () => {
  it("blocks a sign-out while a trip is recording", () => {
    expect(signOutBlockReason({ activeTripId: "trip-1" })).toBe("trip_active");
  });

  it("allows a sign-out when no trip is recording", () => {
    expect(signOutBlockReason({ activeTripId: null })).toBeNull();
  });
});

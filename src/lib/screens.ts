/**
 * The 21 screens from docs/12 (21 screens + 6 overlays), as one mapping used
 * by placeholder routes, tests and later navigation helpers.
 */
export const SCREENS = {
  S1: { id: "S1", title: "Splash", route: "/" },
  S2: { id: "S2", title: "Sign in", route: "/(auth)/sign-in" },
  S3: { id: "S3", title: "Verify OTP", route: "/(auth)/verify" },
  S4: { id: "S4", title: "Access Notice", route: "/access-notice" },
  D1: { id: "D1", title: "Location Permission", route: "/(onboarding)/permissions" },
  D2: { id: "D2", title: "Battery Setup", route: "/(onboarding)/battery" },
  D3: { id: "D3", title: "My Trips", route: "/(driver)" },
  D4: { id: "D4", title: "Trip Detail & Start", route: "/(driver)/trips/[id]" },
  D5: { id: "D5", title: "Active Trip", route: "/(driver)/trips/[id]/live" },
  D6: { id: "D6", title: "Trip Summary", route: "/(driver)/trips/[id]/summary" },
  D7: { id: "D7", title: "Trip History", route: "/(driver)/history" },
  D8: { id: "D8", title: "My Profile", route: "/(driver)/profile" },
  C1: { id: "C1", title: "Live Dashboard", route: "/(console)" },
  C2: { id: "C2", title: "Loads", route: "/(console)/loads" },
  C3: { id: "C3", title: "Create Load", route: "/(console)/loads/new" },
  C4: { id: "C4", title: "Load Detail & Assign", route: "/(console)/loads/[id]" },
  C5: { id: "C5", title: "Trips", route: "/(console)/trips" },
  C6: { id: "C6", title: "Trip Detail & Review", route: "/(console)/trips/[id]" },
  C7: { id: "C7", title: "Review Queue", route: "/(console)/review" },
  C8: { id: "C8", title: "Drivers", route: "/(console)/drivers" },
  C9: { id: "C9", title: "Vehicles", route: "/(console)/vehicles" },
} as const;

export type ScreenId = keyof typeof SCREENS;

export const screenList = Object.values(SCREENS);

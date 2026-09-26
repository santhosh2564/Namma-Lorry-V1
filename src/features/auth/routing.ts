// Root routing decision (docs/04 §2), as a pure function so every
// role × platform × state combination is unit-tested (routing.test.ts).
//
//   App start → active trip in local DB? → yes: resume Active Trip (native only)
//             → session? → no: Sign in
//             → profile.role: inactive → S4 deactivated · admin → console
//                             owner/shipper → S4 coming soon
//                             driver + web → S4 use the mobile app
//                             driver + native → permissions ok? → My Trips : onboarding

export type Platform = 'ios' | 'android' | 'web';
export type Role = 'driver' | 'owner' | 'shipper' | 'admin';

export type Loadable<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; value: T };

export interface RoutingInput {
  platform: Platform;
  /** Local tracking state (stub until M8). Ignored on web: web never runs trips. */
  localTrip: Loadable<{ activeTripId: string | null }>;
  auth: 'loading' | 'signed-out' | 'signed-in';
  /** `null` = signed in but no profile row is visible. */
  profile: Loadable<{ role: Role; isActive: boolean } | null>;
  /** Tracking permissions (stub until M9). Only consulted for drivers on native. */
  permissions: Loadable<{ ok: boolean }>;
}

export type NoticeVariant = 'driver-web' | 'coming-soon' | 'deactivated' | 'no-profile';

export type Destination =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'resume-trip'; tripId: string }
  | { kind: 'sign-in' }
  | { kind: 'notice'; variant: NoticeVariant }
  | { kind: 'onboarding' }
  | { kind: 'driver-home' }
  | { kind: 'console' };

const LOADING: Destination = { kind: 'loading' };
const ERROR: Destination = { kind: 'error' };

export function decideRoute(input: RoutingInput): Destination {
  const native = input.platform !== 'web';

  // 1. An active trip always wins, before auth, so tracking resumes after a kill/reboot.
  if (native) {
    if (input.localTrip.status === 'loading') return LOADING;
    // A broken local DB must not lock the driver out; fall through to the normal flow.
    if (input.localTrip.status === 'ready' && input.localTrip.value.activeTripId) {
      return { kind: 'resume-trip', tripId: input.localTrip.value.activeTripId };
    }
  }

  // 2. Session.
  if (input.auth === 'loading') return LOADING;
  if (input.auth === 'signed-out') return { kind: 'sign-in' };

  // 3. Profile and role gate.
  if (input.profile.status === 'loading') return LOADING;
  if (input.profile.status === 'error') return ERROR;
  const profile = input.profile.value;
  if (!profile) return { kind: 'notice', variant: 'no-profile' };
  if (!profile.isActive) return { kind: 'notice', variant: 'deactivated' };

  switch (profile.role) {
    case 'admin':
      return { kind: 'console' };
    case 'owner':
    case 'shipper':
      return { kind: 'notice', variant: 'coming-soon' };
    case 'driver': {
      if (!native) return { kind: 'notice', variant: 'driver-web' };
      if (input.permissions.status === 'loading') return LOADING;
      // Unknown permission state → onboarding, which re-checks and explains.
      if (input.permissions.status === 'error' || !input.permissions.value.ok) return { kind: 'onboarding' };
      return { kind: 'driver-home' };
    }
  }
}

/** Route groups a destination may be viewed from; used by layout guards. */
export type Area = 'auth' | 'notice' | 'driver' | 'console';

export function areaOf(d: Destination): Area | null {
  switch (d.kind) {
    case 'sign-in':
      return 'auth';
    case 'notice':
      return 'notice';
    case 'resume-trip':
    case 'onboarding':
    case 'driver-home':
      return 'driver';
    case 'console':
      return 'console';
    default:
      return null;
  }
}

export function hrefFor(d: Destination): string | null {
  switch (d.kind) {
    case 'resume-trip':
      return `/driver/trips/${encodeURIComponent(d.tripId)}/live`;
    case 'sign-in':
      return '/sign-in';
    case 'notice':
      return `/access-notice?variant=${d.variant}`;
    case 'onboarding':
      return '/permissions';
    case 'driver-home':
      return '/driver';
    case 'console':
      return '/console';
    default:
      return null;
  }
}

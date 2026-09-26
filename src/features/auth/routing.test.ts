import { areaOf, decideRoute, hrefFor, type Destination, type Platform, type Role, type RoutingInput } from './routing';

const ready = <T,>(value: T) => ({ status: 'ready' as const, value });
const loading = { status: 'loading' as const };
const error = { status: 'error' as const };

function input(over: Partial<RoutingInput> = {}): RoutingInput {
  return {
    platform: 'android',
    localTrip: ready({ activeTripId: null }),
    auth: 'signed-in',
    profile: ready({ role: 'driver' as Role, isActive: true }),
    permissions: ready({ ok: true }),
    ...over,
  };
}

const HOME: Destination = { kind: 'driver-home' };
const ONBOARD: Destination = { kind: 'onboarding' };
const CONSOLE: Destination = { kind: 'console' };
const notice = (variant: string) => ({ kind: 'notice', variant });

describe('decideRoute: every role × platform × permission state (active, signed in, no local trip)', () => {
  // [role, platform, permissionsOk, expected]
  const table: [Role, Platform, boolean, Destination | ReturnType<typeof notice>][] = [
    ['driver', 'android', true, HOME],
    ['driver', 'android', false, ONBOARD],
    ['driver', 'ios', true, HOME],
    ['driver', 'ios', false, ONBOARD],
    ['driver', 'web', true, notice('driver-web')],
    ['driver', 'web', false, notice('driver-web')],
    ['admin', 'android', true, CONSOLE],
    ['admin', 'android', false, CONSOLE],
    ['admin', 'ios', true, CONSOLE],
    ['admin', 'ios', false, CONSOLE],
    ['admin', 'web', true, CONSOLE],
    ['admin', 'web', false, CONSOLE],
    ['owner', 'android', true, notice('coming-soon')],
    ['owner', 'ios', false, notice('coming-soon')],
    ['owner', 'web', true, notice('coming-soon')],
    ['shipper', 'android', false, notice('coming-soon')],
    ['shipper', 'ios', true, notice('coming-soon')],
    ['shipper', 'web', false, notice('coming-soon')],
  ];

  it.each(table)('%s on %s (permissions ok: %s)', (role, platform, ok, expected) => {
    expect(
      decideRoute(input({ platform, profile: ready({ role, isActive: true }), permissions: ready({ ok }) })),
    ).toEqual(expected);
  });
});

describe('decideRoute: inactive accounts', () => {
  const roles: Role[] = ['driver', 'owner', 'shipper', 'admin'];
  const platforms: Platform[] = ['android', 'ios', 'web'];
  it.each(roles.flatMap((r) => platforms.map((p) => [r, p] as const)))(
    'inactive %s on %s → S4 deactivated',
    (role, platform) => {
      expect(decideRoute(input({ platform, profile: ready({ role, isActive: false }) }))).toEqual(
        notice('deactivated'),
      );
    },
  );
});

describe('decideRoute: local active trip (S1 checks tracking state first)', () => {
  it.each<Platform>(['android', 'ios'])('resumes the trip on %s before anything else', (platform) => {
    const d = decideRoute(
      input({
        platform,
        localTrip: ready({ activeTripId: 'trip-1' }),
        auth: 'loading',
        profile: loading,
        permissions: loading,
      }),
    );
    expect(d).toEqual({ kind: 'resume-trip', tripId: 'trip-1' });
  });

  it('resumes even when signed out (points keep queueing locally)', () => {
    expect(decideRoute(input({ localTrip: ready({ activeTripId: 't' }), auth: 'signed-out' }))).toEqual({
      kind: 'resume-trip',
      tripId: 't',
    });
  });

  it('ignores local trip state on web', () => {
    expect(
      decideRoute(input({ platform: 'web', localTrip: ready({ activeTripId: 't' }), auth: 'signed-out' })),
    ).toEqual({ kind: 'sign-in' });
    expect(decideRoute(input({ platform: 'web', localTrip: loading, auth: 'signed-out' }))).toEqual({
      kind: 'sign-in',
    });
  });

  it('waits for the local check on native', () => {
    expect(decideRoute(input({ localTrip: loading, auth: 'signed-out' }))).toEqual({ kind: 'loading' });
  });

  it('falls through to the normal flow if the local check fails', () => {
    expect(decideRoute(input({ localTrip: error }))).toEqual(HOME);
  });
});

describe('decideRoute: session and profile states', () => {
  it.each<Platform>(['android', 'ios', 'web'])('signed out on %s → sign in', (platform) => {
    expect(decideRoute(input({ platform, auth: 'signed-out', profile: loading }))).toEqual({ kind: 'sign-in' });
  });

  it.each<Platform>(['android', 'ios', 'web'])('auth still loading on %s → loading', (platform) => {
    expect(decideRoute(input({ platform, auth: 'loading' }))).toEqual({ kind: 'loading' });
  });

  it('profile loading → loading', () => {
    expect(decideRoute(input({ profile: loading }))).toEqual({ kind: 'loading' });
  });

  it('profile fetch failed → error (retry on splash)', () => {
    expect(decideRoute(input({ profile: error }))).toEqual({ kind: 'error' });
  });

  it.each<Platform>(['android', 'ios', 'web'])('no profile row on %s → S4 no-profile', (platform) => {
    expect(decideRoute(input({ platform, profile: ready(null) }))).toEqual(notice('no-profile'));
  });

  it('driver on native waits for the permission check', () => {
    expect(decideRoute(input({ permissions: loading }))).toEqual({ kind: 'loading' });
  });

  it('driver on native with an unknown permission state → onboarding', () => {
    expect(decideRoute(input({ permissions: error }))).toEqual(ONBOARD);
  });

  it('admin never waits for permissions', () => {
    expect(decideRoute(input({ profile: ready({ role: 'admin', isActive: true }), permissions: loading }))).toEqual(
      CONSOLE,
    );
  });
});

describe('hrefFor / areaOf', () => {
  it.each<[Destination, string | null, string | null]>([
    [{ kind: 'loading' }, null, null],
    [{ kind: 'error' }, null, null],
    [{ kind: 'resume-trip', tripId: 'abc' }, '/driver/trips/abc/live', 'driver'],
    [{ kind: 'sign-in' }, '/sign-in', 'auth'],
    [{ kind: 'notice', variant: 'driver-web' }, '/access-notice?variant=driver-web', 'notice'],
    [{ kind: 'notice', variant: 'coming-soon' }, '/access-notice?variant=coming-soon', 'notice'],
    [{ kind: 'notice', variant: 'deactivated' }, '/access-notice?variant=deactivated', 'notice'],
    [{ kind: 'onboarding' }, '/permissions', 'driver'],
    [{ kind: 'driver-home' }, '/driver', 'driver'],
    [{ kind: 'console' }, '/console', 'console'],
  ])('%j → %s (%s)', (d, href, area) => {
    expect(hrefFor(d)).toBe(href);
    expect(areaOf(d)).toBe(area);
  });
});

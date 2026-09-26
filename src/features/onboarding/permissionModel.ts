// D1 permission model (docs/12 D1, docs/09 §1–§3), as pure functions so every
// state is unit-tested without a device (permissionModel.test.ts).
//
// Order is fixed: precise foreground location → "Allow all the time" →
// notifications. Android and iOS both refuse a background request before the
// foreground one is granted, and asking for everything at once is what Play's
// prominent-disclosure policy forbids.

export type PermStatus = 'granted' | 'undetermined' | 'denied' | 'blocked';

export interface PermissionSnapshot {
  platform: 'ios' | 'android';
  foreground: PermStatus;
  /** Precise (iOS "full" / Android "fine") accuracy. Approximate location can't prove a pickup. */
  precise: boolean;
  background: PermStatus;
  notifications: PermStatus;
  /** Device location (GPS) switch. Not a permission, but tracking can't work without it. */
  servicesEnabled: boolean;
}

/** Shape shared by expo-location and expo-notifications permission responses. */
export interface RawPermission {
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
}

export function toPermStatus(r: RawPermission): PermStatus {
  if (r.status === 'granted') return 'granted';
  if (r.status === 'undetermined') return r.canAskAgain ? 'undetermined' : 'blocked';
  return r.canAskAgain ? 'denied' : 'blocked';
}

export function isPrecise(r: { ios?: { accuracy?: string }; android?: { accuracy?: string } }): boolean {
  if (r.ios?.accuracy) return r.ios.accuracy === 'full';
  if (r.android?.accuracy) return r.android.accuracy === 'fine';
  return true; // older OS versions have no approximate mode
}

/** What trips need: precise location, all the time. Checked on every app foreground. */
export function isLocationReady(s: PermissionSnapshot): boolean {
  return s.foreground === 'granted' && s.precise && s.background === 'granted';
}

export type PermissionKey = 'location' | 'background' | 'notifications';

/**
 * - `allowed`: done.
 * - `ask`: the next step; its button opens the system dialog.
 * - `settings`: the system won't show the dialog again; its button opens app settings.
 * - `waiting`: an earlier step comes first.
 * - `optional-denied`: notifications refused; trips still work (ND-30).
 */
export type RowState = 'allowed' | 'ask' | 'settings' | 'waiting' | 'optional-denied';

export interface PermissionRow {
  key: PermissionKey;
  state: RowState;
}

function stepState(status: PermStatus, done: boolean): RowState {
  if (done) return 'allowed';
  return status === 'blocked' ? 'settings' : 'ask';
}

export function permissionRows(s: PermissionSnapshot): PermissionRow[] {
  const locationDone = s.foreground === 'granted' && s.precise;
  // Granted but approximate: iOS only offers "Precise: On" in Settings; Android 12+
  // shows the upgrade dialog again on a new foreground request unless blocked.
  const location: RowState = locationDone
    ? 'allowed'
    : s.foreground === 'granted' && !s.precise
      ? s.platform === 'ios'
        ? 'settings'
        : 'ask'
      : stepState(s.foreground, false);

  const background: RowState = !locationDone
    ? s.background === 'granted'
      ? 'allowed'
      : 'waiting'
    : stepState(s.background, s.background === 'granted');

  const notifications: RowState =
    s.notifications === 'granted'
      ? 'allowed'
      : !isLocationReady(s)
        ? 'waiting'
        : s.notifications === 'undetermined'
          ? 'ask'
          : 'optional-denied';

  return [
    { key: 'location', state: location },
    { key: 'background', state: background },
    { key: 'notifications', state: notifications },
  ];
}

/** The next dialog/settings step the screen should run, or null when done. */
export function nextStep(s: PermissionSnapshot): PermissionRow | null {
  return permissionRows(s).find((r) => r.state === 'ask' || r.state === 'settings') ?? null;
}

/** Continue needs location ready and notifications at least asked once. */
export function canContinue(s: PermissionSnapshot): boolean {
  return isLocationReady(s) && s.notifications !== 'undetermined';
}

export function readyCount(s: PermissionSnapshot): number {
  return permissionRows(s).filter((r) => r.state === 'allowed').length;
}

import {
  canContinue,
  isLocationReady,
  isPrecise,
  nextStep,
  permissionRows,
  readyCount,
  toPermStatus,
  type PermissionSnapshot,
} from './permissionModel';

const base: PermissionSnapshot = {
  platform: 'android',
  foreground: 'undetermined',
  precise: true,
  background: 'undetermined',
  notifications: 'undetermined',
  servicesEnabled: true,
};
const snap = (p: Partial<PermissionSnapshot>): PermissionSnapshot => ({ ...base, ...p });
const states = (s: PermissionSnapshot) => permissionRows(s).map((r) => `${r.key}:${r.state}`);

describe('toPermStatus', () => {
  it.each([
    [{ status: 'granted', canAskAgain: true }, 'granted'],
    [{ status: 'granted', canAskAgain: false }, 'granted'],
    [{ status: 'undetermined', canAskAgain: true }, 'undetermined'],
    [{ status: 'undetermined', canAskAgain: false }, 'blocked'],
    [{ status: 'denied', canAskAgain: true }, 'denied'],
    [{ status: 'denied', canAskAgain: false }, 'blocked'],
  ] as const)('%j → %s', (raw, expected) => {
    expect(toPermStatus(raw)).toBe(expected);
  });
});

describe('isPrecise', () => {
  it('reads iOS full / reduced and Android fine / coarse', () => {
    expect(isPrecise({ ios: { accuracy: 'full' } })).toBe(true);
    expect(isPrecise({ ios: { accuracy: 'reduced' } })).toBe(false);
    expect(isPrecise({ android: { accuracy: 'fine' } })).toBe(true);
    expect(isPrecise({ android: { accuracy: 'coarse' } })).toBe(false);
    expect(isPrecise({ android: { accuracy: 'none' } })).toBe(false);
  });
  it('treats a missing field (older OS, no approximate mode) as precise', () => {
    expect(isPrecise({})).toBe(true);
  });
});

describe('permission order: foreground → background → notifications', () => {
  it('fresh install: only precise location can be asked; the rest wait', () => {
    const s = snap({});
    expect(states(s)).toEqual(['location:ask', 'background:waiting', 'notifications:waiting']);
    expect(nextStep(s)?.key).toBe('location');
    expect(readyCount(s)).toBe(0);
    expect(canContinue(s)).toBe(false);
  });

  it('foreground granted: background is next, notifications still wait', () => {
    const s = snap({ foreground: 'granted' });
    expect(states(s)).toEqual(['location:allowed', 'background:ask', 'notifications:waiting']);
    expect(nextStep(s)?.key).toBe('background');
  });

  it('location ready: notifications are next and Continue is still disabled', () => {
    const s = snap({ foreground: 'granted', background: 'granted' });
    expect(isLocationReady(s)).toBe(true);
    expect(states(s)).toEqual(['location:allowed', 'background:allowed', 'notifications:ask']);
    expect(nextStep(s)?.key).toBe('notifications');
    expect(canContinue(s)).toBe(false);
  });

  it('all granted: 3 of 3, no next step, Continue enabled', () => {
    const s = snap({ foreground: 'granted', background: 'granted', notifications: 'granted' });
    expect(readyCount(s)).toBe(3);
    expect(nextStep(s)).toBeNull();
    expect(canContinue(s)).toBe(true);
  });

  it('notifications refused after asking: optional, Continue enabled (ND-30)', () => {
    for (const n of ['denied', 'blocked'] as const) {
      const s = snap({ foreground: 'granted', background: 'granted', notifications: n });
      expect(states(s)[2]).toBe('notifications:optional-denied');
      expect(nextStep(s)).toBeNull();
      expect(canContinue(s)).toBe(true);
    }
  });

  it('notifications granted early still count as allowed', () => {
    expect(states(snap({ notifications: 'granted' }))[2]).toBe('notifications:allowed');
  });
});

describe('denied and blocked', () => {
  it('foreground denied but askable: ask again', () => {
    expect(nextStep(snap({ foreground: 'denied' }))).toEqual({ key: 'location', state: 'ask' });
  });

  it('foreground blocked: open settings', () => {
    expect(nextStep(snap({ foreground: 'blocked' }))).toEqual({ key: 'location', state: 'settings' });
  });

  it('background blocked ("Allow all the time" refused): open settings', () => {
    const s = snap({ foreground: 'granted', background: 'blocked' });
    expect(nextStep(s)).toEqual({ key: 'background', state: 'settings' });
    expect(isLocationReady(s)).toBe(false);
    expect(canContinue(s)).toBe(false);
  });

  it('approximate location: Android asks again, iOS needs Settings', () => {
    expect(nextStep(snap({ foreground: 'granted', precise: false }))).toEqual({
      key: 'location',
      state: 'ask',
    });
    expect(nextStep(snap({ platform: 'ios', foreground: 'granted', precise: false }))).toEqual({
      key: 'location',
      state: 'settings',
    });
  });

  it('approximate location is not ready even with background granted', () => {
    const s = snap({
      foreground: 'granted',
      precise: false,
      background: 'granted',
      notifications: 'granted',
    });
    expect(isLocationReady(s)).toBe(false);
    expect(states(s)).toEqual(['location:ask', 'background:allowed', 'notifications:allowed']);
    expect(canContinue(s)).toBe(false);
  });

  it('background revoked later (foreground re-check): location no longer ready', () => {
    const s = snap({ foreground: 'granted', background: 'denied', notifications: 'granted' });
    expect(isLocationReady(s)).toBe(false);
    expect(nextStep(s)).toEqual({ key: 'background', state: 'ask' });
  });
});

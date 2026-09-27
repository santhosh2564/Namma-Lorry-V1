import { healthCheck, initials } from './health';
import type { PermissionSnapshot } from './permissionModel';

const ok: PermissionSnapshot = {
  platform: 'android',
  foreground: 'granted',
  precise: true,
  background: 'granted',
  notifications: 'granted',
  servicesEnabled: true,
};

describe('healthCheck', () => {
  it('all good', () => {
    expect(healthCheck(ok, false)).toEqual({ ok: true, issues: [], fixHref: '/permissions' });
  });
  it('notifications refused is still all good (ND-30)', () => {
    expect(healthCheck({ ...ok, notifications: 'blocked' }, false).ok).toBe(true);
  });
  it('lost background location → D1', () => {
    expect(healthCheck({ ...ok, background: 'denied' }, false)).toEqual({
      ok: false,
      issues: ['location'],
      fixHref: '/permissions',
    });
  });
  it('battery setup never done → D2; location problems come first', () => {
    expect(healthCheck(ok, true)).toMatchObject({ ok: false, issues: ['battery'], fixHref: '/battery' });
    expect(healthCheck({ ...ok, servicesEnabled: false }, true)).toMatchObject({
      issues: ['gps-off', 'battery'],
      fixHref: '/permissions',
    });
  });
});

describe('initials', () => {
  it.each([
    ['Murugan S', 'MS'],
    ['ravi kumar raj', 'RR'],
    ['Manjunath', 'M'],
    ['  ', '?'],
    [null, '?'],
  ])('%s → %s', (name, out) => expect(initials(name)).toBe(out));
});

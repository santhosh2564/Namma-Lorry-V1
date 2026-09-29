// R0: mod-level app.config checks via `expo config --type introspect` (runs the config
// plugins without a prebuild): no iOS `fetch` background mode; Android cleartext explicitly
// off in release, left to the default in development.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '..', '..');
const expoCli = join(root, 'node_modules', 'expo', 'bin', 'cli');

function introspect(appEnv) {
  const res = spawnSync(process.execPath, [expoCli, 'config', '--type', 'introspect', '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, EXPO_PUBLIC_APP_ENV: appEnv, SENTRY_AUTH_TOKEN: '' },
  });
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout)._internal.modResults;
}

for (const appEnv of ['preview', 'production']) {
  test(`${appEnv}: iOS background modes = location only; Android cleartext off`, () => {
    const mods = introspect(appEnv);
    assert.deepEqual(mods.ios.infoPlist.UIBackgroundModes, ['location']);
    const app = mods.android.manifest.manifest.application[0].$;
    assert.equal(app['android:usesCleartextTraffic'], 'false');
    assert.equal(app['android:allowBackup'], 'false');
  });
}

test('development: cleartext not forced off (dev client reaches Metro over http)', () => {
  const mods = introspect('development');
  const app = mods.android.manifest.manifest.application[0].$;
  assert.notEqual(app['android:usesCleartextTraffic'], 'false');
  assert.deepEqual(mods.ios.infoPlist.UIBackgroundModes, ['location']);
});

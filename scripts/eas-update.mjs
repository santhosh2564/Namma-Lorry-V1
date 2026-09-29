#!/usr/bin/env node
/**
 * Publish an EAS Update (OTA JS bundle) safely (M12c).
 *
 *   npm run update:preview -- "Fix trip list refresh"
 *   npm run update:production -- "Fix trip list refresh"
 *
 * Why a wrapper: `eas update` does NOT apply eas.json `build.<profile>.env`, so a bare
 * `eas update --channel production` would inline EXPO_PUBLIC_APP_ENV=development into a
 * production bundle (Sentry off, http allowed). This keeps channel, EAS environment and
 * EXPO_PUBLIC_APP_ENV identical, and refuses to publish from a dirty working tree so every
 * update maps to a commit (docs/RUNBOOK.md §2).
 */
import { execFileSync, spawnSync } from 'node:child_process';

const [channel, ...rest] = process.argv.slice(2);
const message = rest.join(' ').trim();

if (!['preview', 'production'].includes(channel)) {
  console.error('usage: node scripts/eas-update.mjs <preview|production> "<message>"');
  process.exit(1);
}
if (!message) {
  console.error('[eas-update] a message is required (what changed, for the rollback log)');
  process.exit(1);
}

const dirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (dirty) {
  console.error('[eas-update] working tree is dirty; commit first so the update maps to a commit');
  process.exit(1);
}
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();

const result = spawnSync(
  'npx',
  [
    'eas',
    'update',
    '--channel',
    channel,
    '--environment',
    channel,
    '--message',
    `${message} (${sha})`,
    '--non-interactive',
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, EXPO_PUBLIC_APP_ENV: channel },
  },
);
process.exit(result.status ?? 1);

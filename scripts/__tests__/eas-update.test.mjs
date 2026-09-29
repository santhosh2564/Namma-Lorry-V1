// R0 P0-1: eas-update must pass the message as ONE argument (no shell joining on Windows),
// refuse a dirty tree, and set EXPO_PUBLIC_APP_ENV to the channel.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildArgs, checkClean, childEnv } from '../eas-update.mjs';

const script = fileURLToPath(new URL('../eas-update.mjs', import.meta.url));

/** A throwaway git repo with one commit, plus a fake `eas` that records what it received. */
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'eas-update-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'core.autocrlf', 'false');
  writeFileSync(join(dir, 'README'), 'x\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  // Outside the repo so writing them doesn't dirty the tree.
  const tools = mkdtempSync(join(tmpdir(), 'eas-update-tools-'));
  const out = join(tools, 'eas-argv.json');
  const fakeEas = join(tools, 'fake-eas.mjs');
  writeFileSync(
    fakeEas,
    `import { writeFileSync } from 'node:fs';
writeFileSync(${JSON.stringify(out)}, JSON.stringify({ argv: process.argv.slice(2), appEnv: process.env.EXPO_PUBLIC_APP_ENV }));`,
  );
  const run = (...args) =>
    spawnSync(process.execPath, [script, ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, EAS_BIN: fakeEas, EXPO_PUBLIC_APP_ENV: 'development' },
    });
  return { dir, out, run, sha: git('rev-parse', '--short', 'HEAD').trim() };
}

test('a message with spaces and parentheses reaches eas as ONE argument', () => {
  const { out, run, sha } = setup();
  const res = run('preview', 'Fix trip (list) refresh & "quotes"');
  assert.equal(res.status, 0, res.stderr);
  const { argv } = JSON.parse(readFileSync(out, 'utf8'));
  const i = argv.indexOf('--message');
  assert.ok(i >= 0, `no --message in ${JSON.stringify(argv)}`);
  assert.equal(argv[i + 1], `Fix trip (list) refresh & "quotes" (${sha})`);
  assert.deepEqual(argv.slice(0, 5), [
    'update',
    '--channel',
    'preview',
    '--environment',
    'preview',
  ]);
  assert.ok(argv.includes('--non-interactive'));
});

test('EXPO_PUBLIC_APP_ENV equals the channel even if the parent env says development', () => {
  const { out, run } = setup();
  assert.equal(run('production', 'msg').status, 0);
  assert.equal(JSON.parse(readFileSync(out, 'utf8')).appEnv, 'production');
  assert.equal(
    childEnv('preview', { EXPO_PUBLIC_APP_ENV: 'development' }).EXPO_PUBLIC_APP_ENV,
    'preview',
  );
});

test('a dirty working tree refuses and never calls eas', () => {
  const { dir, out, run } = setup();
  writeFileSync(join(dir, 'untracked.txt'), 'dirty');
  const res = run('preview', 'msg');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /dirty/);
  assert.equal(existsSync(out), false);
  assert.equal(checkClean(''), true);
  assert.equal(checkClean('?? file\n'), false);
});

test('bad channel or empty message is rejected', () => {
  const { run } = setup();
  assert.equal(run('staging', 'msg').status, 1);
  assert.equal(run('preview', '   ').status, 1);
});

test('buildArgs keeps the message as a single element', () => {
  const args = buildArgs('preview', 'a b (c)', 'abc1234');
  assert.equal(args.filter((a) => a.includes('a b (c)')).length, 1);
});

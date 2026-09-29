#!/usr/bin/env node
/**
 * Publish an EAS Update (an over-the-air JS bundle) safely (validation B5c).
 *
 *   bun run update:preview "Fix trip list refresh"
 *   bun run update:production "Fix trip list refresh"
 *
 * Why a wrapper: `eas update` does NOT apply eas.json `build.<profile>.env`, so
 * a bare `eas update --channel production` would inline whatever
 * EXPO_PUBLIC_APP_ENV the shell has (usually development) into a production
 * bundle. This keeps the channel, the EAS environment (where the Supabase URL,
 * key and Sentry DSN live) and EXPO_PUBLIC_APP_ENV in step, and refuses to
 * publish from a dirty working tree so every update maps to a commit.
 *
 * No shell: with `shell: true`, Windows cmd.exe re-splits the arguments, so a
 * message like "Fix list (crash)" reached eas as several words. eas is always
 * started through the node binary with an argv array instead.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Update channel (= EAS environment, eas.json) → the APP_ENV its builds run with. */
export const APP_ENV_FOR_CHANNEL = { preview: "staging", production: "production" };

export const CHANNELS = Object.keys(APP_ENV_FOR_CHANNEL);

export function buildArgs(channel, message, sha) {
  return [
    "update",
    "--channel",
    channel,
    "--environment",
    channel,
    "--message",
    `${message} (${sha})`,
    "--non-interactive",
  ];
}

/** `git status --porcelain` output → true when there is nothing to commit. */
export const checkClean = (statusOutput) => statusOutput.trim() === "";

export const childEnv = (channel, env = process.env) => ({
  ...env,
  EXPO_PUBLIC_APP_ENV: APP_ENV_FOR_CHANNEL[channel],
});

/**
 * [node, ...prefix] that runs the eas CLI without a shell:
 * EAS_BIN (a JS entry, used by tests) → local eas-cli → `npx eas-cli` via
 * npm's npx-cli.js next to the node binary.
 */
export function resolveEasCommand(env = process.env, cwd = process.cwd()) {
  if (env.EAS_BIN) return [process.execPath, resolve(env.EAS_BIN)];
  const local = join(cwd, "node_modules", "eas-cli", "bin", "run");
  if (existsSync(local)) return [process.execPath, local];
  const candidates = [
    env.npm_execpath && join(dirname(env.npm_execpath), "npx-cli.js"),
    join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js"),
    join(dirname(process.execPath), "..", "lib", "node_modules", "npm", "bin", "npx-cli.js"),
  ].filter(Boolean);
  const npx = candidates.find((p) => existsSync(p));
  if (npx) return [process.execPath, npx, "--yes", "eas-cli"];
  return null;
}

function main() {
  const fail = (msg) => {
    console.error(`[eas-update] ${msg}`);
    process.exit(1);
  };
  const [channel, ...rest] = process.argv.slice(2);
  const message = rest.join(" ").trim();

  if (!CHANNELS.includes(channel)) {
    fail(`usage: node scripts/eas-update.mjs <${CHANNELS.join("|")}> "<message>"`);
  }
  if (!message) fail("a message is required (what changed, for the rollback log)");

  const status = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  if (!checkClean(status)) {
    fail("working tree is dirty; commit first so the update maps to a commit");
  }
  const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();

  const command = resolveEasCommand();
  if (!command) fail("cannot find eas: install eas-cli or run through npm/bun");
  const [bin, ...prefix] = command;

  const result = spawnSync(bin, [...prefix, ...buildArgs(channel, message, sha)], {
    stdio: "inherit",
    shell: false,
    env: childEnv(channel),
  });
  if (result.error) fail(result.error.message);
  process.exit(result.status ?? 1);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();

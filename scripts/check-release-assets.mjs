#!/usr/bin/env node
/**
 * Release asset gate (M12c). Reads PNG headers only (no dependencies) and checks every
 * asset app.config.ts references against the store requirements in docs/release/ASSETS.md.
 *
 *   npm run release:assets            → report; exit 1 on any failure
 *
 * Runs automatically on EAS (package.json `eas-build-pre-install`) for the store-bound
 * profiles (`preview`, `production`) — TestFlight and Play reject the 1×1 placeholders.
 * Development builds and the sideload `preview_apk` profile are not gated.
 */
import { Buffer } from 'node:buffer';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const UNGATED = ['development', 'development_device', 'preview_apk'];

// colorType: 2 = RGB, 6 = RGBA, 3 = palette, 0/4 = grey
export const SPECS = [
  {
    file: 'assets/icon.png',
    w: 1024,
    h: 1024,
    alpha: false,
    why: 'App Store icon: 1024×1024, no transparency',
  },
  {
    file: 'assets/adaptive-icon.png',
    w: 1024,
    h: 1024,
    alpha: true,
    why: 'Android adaptive foreground: 1024×1024, logo inside the central 66% safe zone, transparent background',
  },
  {
    file: 'assets/splash.png',
    min: 512,
    square: true,
    why: 'Splash logo: square, ≥ 512 px, transparent background (shown at 200 dp on navy)',
  },
  {
    file: 'assets/notification-icon.png',
    min: 96,
    square: true,
    alpha: true,
    why: 'Trip notification icon: ≥ 96×96, white silhouette on transparent',
  },
  { file: 'assets/favicon.png', min: 48, square: true, why: 'Web console favicon: ≥ 48×48' },
];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Size, colour type and transparency from the chunk headers. Colour types 4/6 carry an alpha
 * channel; 0/2/3 (grey, RGB, palette) are transparent only with a tRNS chunk (R0: palette
 * PNGs used to count as transparent unconditionally, and tRNS on RGB/grey was ignored).
 */
export function readPng(buf) {
  if (
    buf.length < 33 ||
    !buf.subarray(0, 8).equals(PNG_SIGNATURE) ||
    buf.toString('ascii', 12, 16) !== 'IHDR'
  )
    throw new Error('not a PNG');
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const colorType = buf[25];
  let hasTrns = false;
  for (let at = 8; at + 8 <= buf.length;) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString('ascii', at + 4, at + 8);
    if (type === 'tRNS') hasTrns = true;
    if (type === 'IDAT' || type === 'IEND') break; // tRNS must precede IDAT
    at += 12 + length;
  }
  return { w, h, colorType, hasAlpha: colorType === 4 || colorType === 6 || hasTrns };
}

/** Problems for one asset spec (empty = OK). */
export function checkSpec(s, { w, h, hasAlpha }) {
  const problems = [];
  if (s.w && (w !== s.w || h !== s.h)) problems.push(`is ${w}×${h}, needs ${s.w}×${s.h}`);
  if (s.min && Math.min(w, h) < s.min) problems.push(`is ${w}×${h}, needs ≥ ${s.min}`);
  if (s.square && w !== h) problems.push(`is ${w}×${h}, must be square`);
  if (s.alpha === false && hasAlpha) problems.push('has an alpha channel (App Store rejects it)');
  if (s.alpha === true && !hasAlpha) problems.push('needs a transparent background');
  return problems;
}

function main() {
  const profile = process.env.EAS_BUILD_PROFILE;
  if (process.env.EAS_BUILD && UNGATED.includes(profile)) {
    console.log(`[release:assets] skipped for EAS profile "${profile}"`);
    process.exit(0);
  }
  let failed = 0;
  for (const s of SPECS) {
    let problems;
    if (!existsSync(s.file)) {
      problems = ['missing'];
    } else {
      try {
        problems = checkSpec(s, readPng(readFileSync(s.file)));
      } catch (e) {
        problems = [String(e.message ?? e)];
      }
    }
    if (problems.length) {
      failed++;
      console.error(`✖ ${s.file}: ${problems.join('; ')}\n    → ${s.why}`);
    } else {
      console.log(`✔ ${s.file}`);
    }
  }
  if (failed) {
    console.error(
      `\n[release:assets] ${failed} asset(s) not release-ready. See docs/release/ASSETS.md.`,
    );
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main();

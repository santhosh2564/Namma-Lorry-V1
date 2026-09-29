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
import { readFileSync, existsSync } from 'node:fs';

const profile = process.env.EAS_BUILD_PROFILE;
const UNGATED = ['development', 'development_device', 'preview_apk'];
if (process.env.EAS_BUILD && UNGATED.includes(profile)) {
  console.log(`[release:assets] skipped for EAS profile "${profile}"`);
  process.exit(0);
}

// colorType: 2 = RGB, 6 = RGBA, 3 = palette, 0/4 = grey
const SPECS = [
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

function readPng(file) {
  const buf = readFileSync(file);
  if (buf.length < 29 || buf.readUInt32BE(12) !== 0x49484452) throw new Error('not a PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf[25] };
}

let failed = 0;
for (const s of SPECS) {
  const problems = [];
  if (!existsSync(s.file)) {
    problems.push('missing');
  } else {
    try {
      const { w, h, colorType } = readPng(s.file);
      if (s.w && (w !== s.w || h !== s.h)) problems.push(`is ${w}×${h}, needs ${s.w}×${s.h}`);
      if (s.min && Math.min(w, h) < s.min) problems.push(`is ${w}×${h}, needs ≥ ${s.min}`);
      if (s.square && w !== h) problems.push(`is ${w}×${h}, must be square`);
      const hasAlpha = colorType === 6 || colorType === 4;
      if (s.alpha === false && hasAlpha)
        problems.push('has an alpha channel (App Store rejects it)');
      if (s.alpha === true && !hasAlpha && colorType !== 3)
        problems.push('needs a transparent background');
    } catch (e) {
      problems.push(String(e.message ?? e));
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

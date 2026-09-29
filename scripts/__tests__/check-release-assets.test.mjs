// Validation B5c: the release asset check. Palette / RGB / grey PNGs with a
// tRNS chunk have transparency; without it they don't. Until the brand assets
// exist it reports and exits 0; `--strict` (release) exits 1.
import { Buffer } from "node:buffer";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";

import { SPECS, checkSpec, readPng } from "../check-release-assets.mjs";

const script = fileURLToPath(new URL("../check-release-assets.mjs", import.meta.url));
const run = (cwd, ...args) =>
  spawnSync(process.execPath, [script, ...args], { cwd, encoding: "utf8" });

function chunk(type, data = Buffer.alloc(0)) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

/** Minimal PNG header stream: signature, IHDR, optional PLTE/tRNS, IEND (no pixel data needed). */
function png({ w = 1024, h = 1024, colorType, trns = false }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
  ];
  if (colorType === 3) parts.push(chunk("PLTE", Buffer.from([0, 0, 0, 255, 255, 255])));
  if (trns) parts.push(chunk("tRNS", Buffer.from([0])));
  parts.push(chunk("IDAT", Buffer.from([0])), chunk("IEND"));
  return Buffer.concat(parts);
}

const icon = { file: "icon.png", w: 1024, h: 1024, alpha: false, why: "" };
const adaptive = { file: "adaptive.png", w: 1024, h: 1024, alpha: true, why: "" };

test("readPng reports size, colour type and tRNS", () => {
  assert.deepEqual(readPng(png({ colorType: 3, trns: true })), {
    w: 1024,
    h: 1024,
    colorType: 3,
    hasAlpha: true,
  });
  assert.equal(readPng(png({ colorType: 3 })).hasAlpha, false);
  assert.equal(readPng(png({ colorType: 2, trns: true })).hasAlpha, true);
  assert.equal(readPng(png({ colorType: 0, trns: true })).hasAlpha, true);
  assert.equal(readPng(png({ colorType: 6 })).hasAlpha, true);
  assert.equal(readPng(png({ colorType: 4 })).hasAlpha, true);
  assert.equal(readPng(png({ colorType: 2 })).hasAlpha, false);
  assert.throws(() => readPng(Buffer.from("GIF89a")), /not a PNG/);
});

test("App Store icon: palette PNG WITH tRNS is rejected (has transparency)", () => {
  assert.match(checkSpec(icon, readPng(png({ colorType: 3, trns: true }))).join(), /alpha/);
});

test("App Store icon: opaque palette / RGB passes", () => {
  assert.deepEqual(checkSpec(icon, readPng(png({ colorType: 3 }))), []);
  assert.deepEqual(checkSpec(icon, readPng(png({ colorType: 2 }))), []);
});

test("adaptive icon: palette PNG WITHOUT tRNS is rejected (no transparency)", () => {
  assert.match(checkSpec(adaptive, readPng(png({ colorType: 3 }))).join(), /transparent/);
});

test("adaptive icon: palette + tRNS and RGBA pass", () => {
  assert.deepEqual(checkSpec(adaptive, readPng(png({ colorType: 3, trns: true }))), []);
  assert.deepEqual(checkSpec(adaptive, readPng(png({ colorType: 6 }))), []);
});

test("size rules still apply", () => {
  assert.match(checkSpec(icon, readPng(png({ w: 1, h: 1, colorType: 2 }))).join(), /1×1/);
  const splash = { file: "s.png", min: 512, square: true, why: "" };
  assert.match(
    checkSpec(splash, readPng(png({ w: 600, h: 500, colorType: 6 }))).join(),
    /square|≥/,
  );
});

test("no assets yet: every file is reported as missing, and the report exits 0", () => {
  const dir = mkdtempSync(join(tmpdir(), "assets-"));
  const res = run(dir);
  assert.equal(res.status, 0, res.stderr);
  for (const s of SPECS) assert.match(res.stderr, new RegExp(`${s.file}: missing`));
  assert.match(res.stderr, /not release-ready/);
  assert.match(res.stderr, /docs\/release\/ASSETS\.md/);
});

test("--strict exits 1 while anything is missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "assets-"));
  assert.equal(run(dir, "--strict").status, 1);
});

test("--strict exits 0 once every asset meets its spec", () => {
  const dir = mkdtempSync(join(tmpdir(), "assets-"));
  mkdirSync(join(dir, "assets"));
  for (const s of SPECS) {
    const size = s.w ?? s.min;
    const colorType = s.alpha === false ? 2 : 6;
    writeFileSync(join(dir, s.file), png({ w: size, h: s.h ?? size, colorType }));
  }
  const res = run(dir, "--strict");
  assert.equal(res.status, 0, res.stderr);
  for (const s of SPECS) assert.match(res.stdout, new RegExp(`✔ ${s.file}`));
});

// R0 P1: palette / RGB / grey PNGs with a tRNS chunk have transparency; without it they don't.
import { Buffer } from 'node:buffer';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32 } from 'node:zlib';

import { checkSpec, readPng } from '../check-release-assets.mjs';

function chunk(type, data = Buffer.alloc(0)) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
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
    chunk('IHDR', ihdr),
  ];
  if (colorType === 3) parts.push(chunk('PLTE', Buffer.from([0, 0, 0, 255, 255, 255])));
  if (trns) parts.push(chunk('tRNS', Buffer.from([0])));
  parts.push(chunk('IDAT', Buffer.from([0])), chunk('IEND'));
  return Buffer.concat(parts);
}

const icon = { file: 'icon.png', w: 1024, h: 1024, alpha: false, why: '' };
const adaptive = { file: 'adaptive.png', w: 1024, h: 1024, alpha: true, why: '' };

test('readPng reports size, colour type and tRNS', () => {
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
  assert.throws(() => readPng(Buffer.from('GIF89a')), /not a PNG/);
});

test('App Store icon: palette PNG WITH tRNS is rejected (has transparency)', () => {
  assert.match(checkSpec(icon, readPng(png({ colorType: 3, trns: true }))).join(), /alpha/);
});

test('App Store icon: opaque palette / RGB passes', () => {
  assert.deepEqual(checkSpec(icon, readPng(png({ colorType: 3 }))), []);
  assert.deepEqual(checkSpec(icon, readPng(png({ colorType: 2 }))), []);
});

test('adaptive icon: palette PNG WITHOUT tRNS is rejected (no transparency)', () => {
  assert.match(checkSpec(adaptive, readPng(png({ colorType: 3 }))).join(), /transparent/);
});

test('adaptive icon: palette + tRNS and RGBA pass', () => {
  assert.deepEqual(checkSpec(adaptive, readPng(png({ colorType: 3, trns: true }))), []);
  assert.deepEqual(checkSpec(adaptive, readPng(png({ colorType: 6 }))), []);
});

test('size rules still apply', () => {
  assert.match(checkSpec(icon, readPng(png({ w: 1, h: 1, colorType: 2 }))).join(), /1×1/);
  const splash = { file: 's.png', min: 512, square: true, why: '' };
  assert.match(
    checkSpec(splash, readPng(png({ w: 600, h: 500, colorType: 6 }))).join(),
    /square|≥/,
  );
});

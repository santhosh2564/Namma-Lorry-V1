#!/usr/bin/env node
/**
 * Keeps src/i18n/{ta,kn,hi}.json in step with en.json (the source of truth).
 * - keys missing from a locale are added as "TODO: <english>" for a translator
 * - keys no longer in en.json are removed
 * - existing values (translated or TODO) are kept
 * - language-neutral keys (brand name, separators, `languages.*` endonyms) are copied as-is
 * At runtime src/i18n/index.ts drops TODO values, so users see English until translated.
 * Usage: npm run i18n:sync     (src/i18n/__tests__/locales.test.ts enforces the result)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'i18n');
const en = JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8'));
const neutral = (keyPath) =>
  keyPath.startsWith('languages.') ||
  ['common.appName', 'common.none', 'common.separator'].includes(keyPath);

function merge(source, existing, path) {
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    const keyPath = path ? `${path}.${key}` : key;
    const current = existing?.[key];
    if (typeof value === 'object')
      out[key] = merge(value, typeof current === 'object' ? current : {}, keyPath);
    else if (neutral(keyPath)) out[key] = value;
    else out[key] = typeof current === 'string' ? current : `TODO: ${value}`;
  }
  return out;
}

for (const locale of ['ta', 'kn', 'hi']) {
  const file = join(dir, `${locale}.json`);
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  writeFileSync(file, `${JSON.stringify(merge(en, existing, ''), null, 2)}\n`);
  console.log(`synced ${locale}.json`);
}

#!/usr/bin/env node
// Keeps ta/kn/hi.json in step with en.json (the source of truth):
// - new keys are added as "TODO: <English>" for a translator to finish;
// - existing translations (and existing TODOs) are kept;
// - keys no longer in en.json are removed.
// Usage: node scripts/i18n-sync.js [--check]   (--check exits 1 if any file would change)
const fs = require('fs');
const path = require('path');

const dir = path.join(path.dirname(process.argv[1]), '..', 'src', 'i18n');
const en = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
const check = process.argv.includes('--check');

function sync(src, cur) {
  if (typeof src === 'string') return typeof cur === 'string' ? cur : `TODO: ${src}`;
  if (Array.isArray(src)) return src.map((v, i) => sync(v, Array.isArray(cur) ? cur[i] : undefined));
  const out = {};
  for (const k of Object.keys(src))
    out[k] = sync(src[k], cur && typeof cur === 'object' ? cur[k] : undefined);
  return out;
}

let changed = false;
for (const lang of ['ta', 'kn', 'hi']) {
  const file = path.join(dir, `${lang}.json`);
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '{}';
  const after = JSON.stringify(sync(en, JSON.parse(before)), null, 2) + '\n';
  if (after !== before) {
    changed = true;
    if (check) console.error(`${lang}.json is out of sync with en.json`);
    else fs.writeFileSync(file, after);
  }
}
if (check && changed) {
  console.error('Run: npm run i18n:sync');
  process.exit(1);
}

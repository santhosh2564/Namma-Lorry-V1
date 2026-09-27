import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import en from './en.json';
import { applyLanguage, catalogs, i18n, LANGUAGES, stripTodo, t, translatedShare } from './index';

type Tree = { [k: string]: unknown };
const ROOT = path.join(__dirname, '..', '..');

function leaves(tree: unknown, prefix = ''): [string, string][] {
  if (typeof tree === 'string') return [[prefix, tree]];
  return Object.entries(tree as Tree).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}
const placeholders = (s: string) => [...s.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe('catalogs', () => {
  const enLeaves = leaves(en);

  it.each(LANGUAGES.filter((l) => l !== 'en'))('%s.json has exactly the keys of en.json', (lang) => {
    expect(leaves(catalogs[lang]).map(([k]) => k)).toEqual(enLeaves.map(([k]) => k));
  });

  it.each(LANGUAGES.filter((l) => l !== 'en'))('%s.json keeps every {{placeholder}} of en.json', (lang) => {
    const theirs = new Map(leaves(catalogs[lang]));
    for (const [k, v] of enLeaves) expect([k, placeholders(theirs.get(k)!)]).toEqual([k, placeholders(v)]);
  });

  it('untranslated values are marked TODO (so a translator can find them) and fall back to English', () => {
    expect(leaves(catalogs.ta).every(([, v]) => v.startsWith('TODO: '))).toBe(true);
    expect(translatedShare(catalogs.en as never)).toBe(1);
    expect(translatedShare(catalogs.ta as never)).toBe(0);
    expect(leaves(stripTodo(catalogs.ta as never))).toEqual([]);
  });

  it('scripts/i18n-sync.js --check passes (ta/kn/hi are in step with en)', () => {
    expect(() => execFileSync('node', [path.join(ROOT, 'scripts/i18n-sync.js'), '--check'])).not.toThrow();
  });
});

describe('t (typed live catalog)', () => {
  afterEach(() => applyLanguage('en'));

  it('reads strings, interpolates and pluralises', () => {
    expect(t.common.signOut).toBe('Sign out');
    expect(t.verify.sentTo('+91 98402 34521')).toBe('Sent to +91 98402 34521');
    expect(t.activeTrip.waiting(1)).toBe('1 point waiting to upload');
    expect(t.activeTrip.waiting(3)).toBe('3 points waiting to upload');
    expect(t.activeTrip.offline(0)).toBe('Offline · trip keeps recording on your phone');
    expect(t.reasons.END_OUTSIDE_DROP(2000)).toBe("Trip didn't end at the delivery location (2.0 km away)");
    expect(t.reasons.END_OUTSIDE_DROP(null)).toBe("Trip didn't end at the delivery location");
    expect(t.common.months[8]).toBe('Sep');
  });

  it('switches language live and falls back to English for untranslated keys', () => {
    i18n.addResource('ta', 'translation', 'common.signOut', 'வெளியேறு');
    applyLanguage('ta');
    expect(t.common.signOut).toBe('வெளியேறு');
    expect(t.common.retry).toBe('Try again'); // still TODO in ta.json → English
    applyLanguage('en');
    expect(t.common.signOut).toBe('Sign out');
    i18n.removeResourceBundle('ta', 'translation');
    i18n.addResourceBundle('ta', 'translation', stripTodo(catalogs.ta as never));
  });
});

describe('errors: a message for every backend error code', () => {
  const codes = new Set<string>();
  const dir = path.join(ROOT, 'supabase', 'migrations');
  for (const f of fs.readdirSync(dir)) {
    for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/raise exception '([A-Z_]+)/g))
      codes.add(m[1]!);
  }
  const fnDir = path.join(ROOT, 'supabase', 'functions');
  for (const fn of fs.readdirSync(fnDir)) {
    const p = path.join(fnDir, fn);
    if (!fs.statSync(p).isDirectory()) continue;
    for (const f of fs.readdirSync(p).filter((x) => x.endsWith('.ts') && !x.endsWith('_test.ts'))) {
      const src = fs.readFileSync(path.join(p, f), 'utf8');
      // new HttpError(status, 'CODE' …) / error(status, 'CODE') → { error: 'CODE' }
      for (const m of src.matchAll(/(?:HttpError|error)\(\s*\d{3},\s*'([A-Z_]+)'/g)) codes.add(m[1]!);
    }
  }

  it('found the codes', () => {
    for (const c of [
      'TRIP_NOT_FOUND',
      'OUTSIDE_PICKUP',
      'LANGUAGE_NOT_SUPPORTED',
      'PHONE_EXISTS',
      'NO_ROUTE',
    ])
      expect(codes).toContain(c);
  });

  it('every code has a user-facing text in en.json errors', () => {
    const missing = [...codes].filter((c) => !(c in en.errors));
    expect(missing).toEqual([]);
  });
});

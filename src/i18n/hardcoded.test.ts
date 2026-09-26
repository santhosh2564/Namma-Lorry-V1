import fs from 'fs';
import path from 'path';

import { findFrozenStrings, findHardcodedText } from './hardcoded';

const ROOT = path.join(__dirname, '..', '..');

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'dev' ? [] : tsxFiles(p); // app/dev is dev-only tooling
    return p.endsWith('.tsx') && !p.includes('.test.') ? [p] : [];
  });
}

function tsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return d.name === 'dev' || d.name === 'i18n' ? [] : tsFiles(p);
    return /\.tsx?$/.test(p) && !p.includes('.test.') ? [p] : [];
  });
}

describe('no hard-coded UI text (all strings live in src/i18n)', () => {
  it('finds text in JSX and text props', () => {
    const found = findHardcodedText(
      'x.tsx',
      `const a = <View><Text>Hello there</Text><B label="Save now" n={'Ok go'} /><C title={x} />{'  '}</View>;`,
    );
    expect(found.map((f) => f.text)).toEqual(['Hello there', 'Save now']);
  });

  const files = [...tsxFiles(path.join(ROOT, 'app')), ...tsxFiles(path.join(ROOT, 'src'))];
  it.each(files.map((f) => [path.relative(ROOT, f), f]))('%s', (_rel, file) => {
    expect(findHardcodedText(file, fs.readFileSync(file, 'utf8'))).toEqual([]);
  });
});

describe('no strings frozen at module load (they would ignore a language switch)', () => {
  const files = [...tsFiles(path.join(ROOT, 'app')), ...tsFiles(path.join(ROOT, 'src'))];
  it('finds a top-level read but not one inside a function or getter', () => {
    const src = `const s = t.trips;\nconst A = { a: s.title };\nconst B = { get b() { return s.title; } };\nconst C = () => t.x.y;`;
    expect(findFrozenStrings('x.ts', src).map((f) => f.text)).toEqual(['s.title']);
  });
  it.each(files.map((f) => [path.relative(ROOT, f), f]))('%s', (_rel, file) => {
    expect(findFrozenStrings(file, fs.readFileSync(file, 'utf8'))).toEqual([]);
  });
});

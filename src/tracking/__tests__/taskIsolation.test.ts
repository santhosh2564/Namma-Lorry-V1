// The background location task must do no network I/O (TRD §4.2, M12a): it only maps and
// queues points in SQLite. This walks the task's import graph and fails if any module it can
// reach talks to Supabase, uploads, or calls fetch/XMLHttpRequest/WebSocket.
import fs from 'fs';
import path from 'path';

import { migrate } from '../db';
import { counts, insertTracking } from '../queue';
import { handleLocationUpdate } from '../taskHandler';
import { location } from '../testing/fakes';
import { openNodeSqlite } from '../testing/nodeSqlite';

const SRC = path.join(__dirname, '..', '..');

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.join(path.dirname(from), spec);
  else return null; // package: allowed list checked separately
  for (const ext of ['.ts', '.tsx', '/index.ts', '.json']) if (fs.existsSync(base + ext)) return base + ext;
  return null;
}

function graph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop()!;
    if (files.has(f)) continue;
    files.add(f);
    if (f.endsWith('.json')) continue;
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)) {
      if (/^\s*import\s+type\s/.test(m[0]) || /^\s*export\s+type\s/.test(m[0])) continue;
      const r = resolve(f, m[1]!);
      if (r) stack.push(r);
      else if (!m[1]!.startsWith('.') && !m[1]!.startsWith('@/')) packages.add(m[1]!);
    }
  }
  return { files, packages };
}

describe('background task isolation', () => {
  const { files, packages } = graph(path.join(SRC, 'tracking', 'task.ts'));
  const rel = [...files].map((f) => path.relative(SRC, f));

  it('never reaches Supabase, the uploader or Edge Functions', () => {
    expect(rel).toContain('tracking/taskHandler.ts');
    for (const banned of [
      'lib/supabase.ts',
      'tracking/uploader.ts',
      'tracking/runtime.ts',
      'lib/functions.ts',
    ])
      expect(rel).not.toContain(banned);
  });

  it('uses only local packages', () => {
    const allowed = ['expo-task-manager', 'react', 'react-native', 'expo-sqlite', 'expo-location', 'i18next'];
    expect([...packages].filter((p) => !allowed.includes(p))).toEqual([]);
  });

  it('no reachable module calls the network', () => {
    for (const f of files) {
      if (f.endsWith('.json')) continue;
      expect([
        path.relative(SRC, f),
        /\bfetch\(|XMLHttpRequest|WebSocket/.test(fs.readFileSync(f, 'utf8')),
      ]).toEqual([path.relative(SRC, f), false]);
    }
  });

  it('queues a batch without touching fetch', async () => {
    const fetchSpy = jest.fn();
    const g = globalThis as { fetch?: unknown };
    const saved = g.fetch;
    g.fetch = fetchSpy;
    try {
      const db = openNodeSqlite();
      await migrate(db);
      const t0 = Date.parse('2026-09-26T06:00:00Z');
      await insertTracking(db, 't-1', new Date(t0).toISOString(), new Date(t0).toISOString());
      const batch = [location(t0 + 10_000, 12.75, 77.8), location(t0 + 20_000, 12.752, 77.8)];
      expect(
        await handleLocationUpdate(
          async () => db,
          batch,
          () => t0 + 21_000,
        ),
      ).toBe(2);
      expect((await counts(db, 't-1')).pending).toBe(2);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      g.fetch = saved;
    }
  });
});

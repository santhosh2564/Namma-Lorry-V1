// Static security checks over the app bundle sources (app/, src/) — docs/09 §4–§5, M12a.
// They fail the build if client code gains a write path to trips/driver_stats, calls a
// server-only function, or references a server secret.
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory())
      return d.name === 'screens-tests' || d.name === '__tests__' || d.name === 'testing' ? [] : sources(p);
    return /\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
  });
}
const files = [...sources(path.join(ROOT, 'app')), ...sources(path.join(ROOT, 'src'))].map((f) => ({
  rel: path.relative(ROOT, f),
  // Comments removed: only code counts.
  src: fs
    .readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, ''),
}));

/** `.from('table')` calls followed (within the same chain) by a write method. */
function writes(table: string): { rel: string; op: string }[] {
  const out: { rel: string; op: string }[] = [];
  const re = new RegExp(
    `\\.from\\(\\s*['"]${table}['"]\\s*\\)([\\s\\S]{0,200}?)\\.(insert|update|upsert|delete)\\(`,
    'g',
  );
  for (const f of files) {
    for (const m of f.src.matchAll(re)) {
      if (!m[1]!.includes('.from(')) out.push({ rel: f.rel, op: m[2]! });
    }
  }
  return out;
}

describe('no client write path to verification data (CLAUDE.md rules 1–2)', () => {
  it('trips: only the admin assignment INSERT (C4); never update/upsert/delete', () => {
    expect(writes('trips')).toEqual([{ rel: 'src/features/loads/api.ts', op: 'insert' }]);
  });
  it('driver_stats, trip_events, trip_live: never written by the client', () => {
    expect([...writes('driver_stats'), ...writes('trip_events'), ...writes('trip_live')]).toEqual([]);
  });
  it('trip_points: only the uploader upsert (ignoreDuplicates on trip_id,seq)', () => {
    expect(writes('trip_points')).toEqual([{ rel: 'src/tracking/runtime.ts', op: 'upsert' }]);
  });
  it('profiles: never written directly (consent and language go through RPCs)', () => {
    expect(writes('profiles')).toEqual([]);
  });
  it('server-only functions are never called from the app', () => {
    const banned =
      /\.rpc\(\s*['"](verify_trip|apply_verified_stats|sweep_unverified_trips|handle_new_user)['"]/;
    expect(files.filter((f) => banned.test(f.src)).map((f) => f.rel)).toEqual([]);
  });
});

describe('no server secrets in app code (CLAUDE.md rule 6)', () => {
  it('no secret keys, service role, Mappls REST credentials or private keys', () => {
    const secret =
      /sb_secret_|service_role|SERVICE_ROLE|SUPABASE_SECRET|supabaseAdmin|MAPPLS_(REST_KEY|CLIENT_SECRET|CLIENT_ID)|SENTRY_AUTH_TOKEN|-----BEGIN [A-Z ]*PRIVATE KEY|eyJhbGciOi[\w-]{20,}\.[\w-]{20,}/;
    expect(files.filter((f) => secret.test(f.src)).map((f) => f.rel)).toEqual([]);
  });
  it('the app reads only EXPO_PUBLIC_* variables', () => {
    const vars = new Set(
      files.flatMap((f) => [...f.src.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]!)),
    );
    expect([...vars].filter((v) => !v.startsWith('EXPO_PUBLIC_'))).toEqual([]);
  });
});

// Minimal chainable Supabase mock for screen tests: results are keyed by table
// (`tables[name]` → rows, or `{ count }` for head counts). Use from a jest.mock factory:
//   jest.mock('@/lib/supabase', () => jest.requireActual('./helpers/supabaseMock').module);
export const tables: Record<string, unknown> = {};
export const log: { table: string; ops: [string, unknown[]][] }[] = [];
export const rpc = jest.fn();
/** `errors[name]` makes every query on that table fail with this error (network, RLS…). */
export const errors: Record<string, { message: string; code?: string }> = {};

function builder(table: string) {
  const entry = { table, ops: [] as [string, unknown[]][] };
  log.push(entry);
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'order', 'range', 'limit']) {
    q[m] = (...args: unknown[]) => {
      entry.ops.push([m, args]);
      return q;
    };
  }
  const result = () => {
    if (errors[table]) return { data: null, error: errors[table] };
    const v = tables[table];
    if (v && typeof v === 'object' && !Array.isArray(v) && 'count' in (v as object)) {
      return { data: null, count: (v as { count: number }).count, error: null };
    }
    return { data: v ?? [], error: null };
  };
  q.maybeSingle = async () => {
    if (errors[table]) return { data: null, error: errors[table] };
    const v = tables[table];
    return { data: Array.isArray(v) ? (v[0] ?? null) : (v ?? null), error: null };
  };
  q.then = (resolve: (v: unknown) => void) => resolve(result());
  return q;
}

export const module = {
  supabase: { from: (t: string) => builder(t), rpc: (...a: unknown[]) => rpc(...a) },
};

export function reset() {
  for (const k of Object.keys(tables)) delete tables[k];
  for (const k of Object.keys(errors)) delete errors[k];
  log.length = 0;
  rpc.mockReset();
}

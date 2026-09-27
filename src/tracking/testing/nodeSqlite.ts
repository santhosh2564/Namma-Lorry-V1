// Test-only SqlDb over Node's built-in SQLite (real SQL semantics, real files, crash simulation).
import { DatabaseSync } from 'node:sqlite';

import { createMutex, type SqlDb, type SqlExec, type SqlParam } from '../db';

export interface TestDb extends SqlDb {
  raw: DatabaseSync;
  close(): void;
}

export function openNodeSqlite(path = ':memory:'): TestDb {
  const raw = new DatabaseSync(path);
  raw.exec('pragma journal_mode = wal; pragma busy_timeout = 5000;');
  const lock = createMutex();
  const exec: SqlExec = {
    execAsync: async (sql) => {
      raw.exec(sql);
    },
    runAsync: async (sql, ...params: SqlParam[]) => {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    getFirstAsync: async <T>(sql: string, ...params: SqlParam[]) =>
      ((raw.prepare(sql).get(...params) as T | undefined) ?? null) as T | null,
    getAllAsync: async <T>(sql: string, ...params: SqlParam[]) => raw.prepare(sql).all(...params) as T[],
  };
  return {
    ...exec,
    raw,
    close: () => raw.close(),
    transaction: (fn) =>
      lock(async () => {
        raw.exec('begin immediate');
        try {
          const out = await fn(exec);
          raw.exec('commit');
          return out;
        } catch (e) {
          raw.exec('rollback');
          throw e;
        }
      }),
  };
}

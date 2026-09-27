// Opens the tracking SQLite database. Kept apart from runtime.ts on purpose: the background
// task (task.ts) imports only this, so its module graph never reaches Supabase or the
// uploader and it can't do network I/O (TRD §4.2; checked by __tests__/taskIsolation.test.ts).
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

import { SQLITE_DB_NAME } from './config';
import { fromExpoSqlite, migrate, type SqlDb } from './db';

const isWeb = Platform.OS === 'web';

let dbPromise: Promise<SqlDb> | null = null;

/** The tracking database, opened and migrated once per JS runtime (UI and background task share it). */
export function getTrackingDb(): Promise<SqlDb> {
  dbPromise ??= (async () => {
    const raw = await SQLite.openDatabaseAsync(SQLITE_DB_NAME);
    if (!isWeb) await raw.execAsync('pragma journal_mode = wal; pragma busy_timeout = 5000;');
    const db = fromExpoSqlite(raw as unknown as Parameters<typeof fromExpoSqlite>[0], !isWeb);
    await migrate(db);
    return db;
  })().catch((e) => {
    dbPromise = null; // retry next time
    throw e;
  });
  return dbPromise;
}

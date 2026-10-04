#!/usr/bin/env node
/**
 * Apply db/migrations/*.sql, in order, to DATABASE_URL (N1, docs/17).
 *
 * This is an operator tool, like provision-user.mjs — it runs on a plain
 * Node/bun process with a real TCP connection (the `pg` package), never
 * inside a Cloudflare Pages Function, which can only reach Neon over
 * `@neondatabase/serverless`'s HTTP driver (src/server/db.ts). Works
 * against a local Postgres+PostGIS or a real Neon branch unchanged — both
 * speak the same wire protocol.
 *
 * Tracks what it has already applied in a `schema_migrations` table (one
 * row per filename) so re-running is safe: already-applied files are
 * skipped, not re-run. Each migration runs in its own transaction; a
 * failure stops the run before recording that file as applied.
 *
 *   DATABASE_URL=postgres://... bun run scripts/db-migrate.mjs
 */
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import pg from "pg";

const MIGRATIONS_DIR = resolve(import.meta.dirname, "..", "db", "migrations");

/** Sorted, .sql-only, so a stray README or .gitkeep in the directory is ignored. */
export function sqlFilesInOrder(filenames) {
  return filenames.filter((name) => name.endsWith(".sql")).sort();
}

/** Filenames not yet recorded as applied, in the order they must run. */
export function pendingMigrations(allFiles, appliedFiles) {
  const applied = new Set(appliedFiles);
  return sqlFilesInOrder(allFiles).filter((name) => !applied.has(name));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      filename   text primary key,
      applied_at timestamptz not null default now()
    )
  `);
}

async function appliedMigrations(client) {
  const { rows } = await client.query("select filename from public.schema_migrations");
  return rows.map((r) => r.filename);
}

/** Runs one file's SQL plus its own ledger insert in a single transaction. */
async function applyMigration(client, migrationsDir, filename) {
  const sql = await readFile(resolve(migrationsDir, filename), "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("insert into public.schema_migrations(filename) values ($1)", [filename]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw new Error(`${filename} failed: ${error.message}`);
  }
}

/** `client` is a connected pg.Client (faked in tests). Returns the filenames applied. */
export async function runMigrations({ client, migrationsDir = MIGRATIONS_DIR }) {
  await ensureMigrationsTable(client);
  const allFiles = await readdir(migrationsDir);
  const applied = await appliedMigrations(client);
  const pending = pendingMigrations(allFiles, applied);
  for (const filename of pending) {
    await applyMigration(client, migrationsDir, filename);
  }
  return pending;
}

async function main() {
  const fail = (msg) => {
    console.error(`[db-migrate] ${msg}`);
    process.exit(1);
  };
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) fail("set DATABASE_URL");

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const applied = await runMigrations({ client });
    console.log(
      applied.length === 0
        ? "[db-migrate] nothing to apply"
        : `[db-migrate] applied: ${applied.join(", ")}`,
    );
  } catch (e) {
    fail(e.message);
  } finally {
    await client.end();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}

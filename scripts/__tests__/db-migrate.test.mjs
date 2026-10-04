import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { pendingMigrations, runMigrations, sqlFilesInOrder } from "../db-migrate.mjs";

test("sqlFilesInOrder keeps only .sql files, sorted", () => {
  assert.deepEqual(sqlFilesInOrder(["0002_b.sql", "README.md", "0001_a.sql", ".gitkeep"]), [
    "0001_a.sql",
    "0002_b.sql",
  ]);
});

test("pendingMigrations skips already-applied filenames", () => {
  assert.deepEqual(pendingMigrations(["0001_a.sql", "0002_b.sql", "0003_c.sql"], ["0001_a.sql"]), [
    "0002_b.sql",
    "0003_c.sql",
  ]);
});

test("pendingMigrations is empty once everything is applied", () => {
  assert.deepEqual(pendingMigrations(["0001_a.sql"], ["0001_a.sql"]), []);
});

/** A minimal fake of the one pg.Client surface runMigrations touches. */
function fakeClient({ applied = [], failOn = null } = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.startsWith("create table")) return;
      if (sql.startsWith("select filename"))
        return { rows: applied.map((filename) => ({ filename })) };
      if (sql === "begin" || sql === "commit" || sql === "rollback") return;
      if (sql.startsWith("insert into public.schema_migrations")) return;
      if (failOn && sql.includes(failOn)) throw new Error("boom");
      return; // the migration file's own SQL
    },
  };
}

test("runMigrations applies only the pending files, each in its own transaction", async () => {
  const client = fakeClient({ applied: ["0001_schema.sql"] });
  const applied = await runMigrations({
    client,
    migrationsDir: fileURLToPath(new URL("./fixtures/migrations", import.meta.url)),
  });
  assert.deepEqual(applied, ["0002_second.sql"]);
  const kinds = client.calls.map((c) => c.sql.split(" ")[0]);
  assert.ok(kinds.includes("begin"));
  assert.ok(kinds.includes("commit"));
});

test("runMigrations rolls back and stops on a failing file, recording nothing", async () => {
  const client = fakeClient({ applied: [], failOn: "THIS FAILS" });
  await assert.rejects(
    runMigrations({
      client,
      migrationsDir: fileURLToPath(new URL("./fixtures/migrations-with-failure", import.meta.url)),
    }),
    /failed: boom/,
  );
  const inserts = client.calls.filter((c) =>
    c.sql.startsWith("insert into public.schema_migrations"),
  );
  assert.equal(inserts.length, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

const sourceMigrations = new URL("../../../db/migrations/", import.meta.url);
const sourceRunner = new URL("../scripts/migrate.mjs", import.meta.url);

test("upgrades an earlier SQL schema, preserves rows, and skips applied migrations", async () => {
  const databaseUrl = new URL(process.env.MIGRATION_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname));
  assert.equal(databaseUrl.pathname, "/jekro_migration_test");

  const workspace = await mkdtemp(fileURLToPath(new URL(".migration-test-", import.meta.url)));
  const runner = join(workspace, "apps/api/scripts/migrate.mjs");
  const migrations = join(workspace, "db/migrations");
  const schema = `migration_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl.href });
  databaseUrl.searchParams.set("options", `-c search_path=${schema}`);
  const pool = new Pool({ connectionString: databaseUrl.href });

  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    await mkdir(join(workspace, "apps/api/scripts"), { recursive: true });
    await mkdir(migrations, { recursive: true });
    await copyFile(sourceRunner, runner);
    const files = (await readdir(sourceMigrations)).filter((file) => file.endsWith(".sql")).sort();

    function migrate(expectedStatus = 0) {
      const result = spawnSync(process.execPath, [runner], {
        encoding: "utf8",
        env: { ...process.env, DATABASE_URL: databaseUrl.href },
      });
      assert.ifError(result.error);
      assert.equal(result.status, expectedStatus, result.stderr);
      return result;
    }

    for (const file of files.slice(0, 2)) {
      await copyFile(new URL(file, sourceMigrations), join(migrations, file));
    }
    migrate();

    const { rows: [ticket] } = await pool.query(`
      WITH project AS (INSERT INTO projects (name) VALUES ('Upgrade fixture') RETURNING id)
      INSERT INTO tickets (project_id, title, status)
      SELECT id, 'Existing ticket', 'closed' FROM project
      RETURNING id, status, version
    `);

    for (const file of files.slice(2)) {
      await copyFile(new URL(file, sourceMigrations), join(migrations, file));
    }
    const statusMigration = files[2];
    const statusMigrationPath = join(migrations, statusMigration);
    await appendFile(statusMigrationPath, "\nSELECT * FROM absent_status_migration_fixture;\n");
    assert.match(migrate(1).stderr, /absent_status_migration_fixture/);
    const { rows: [rolledBackTicket] } = await pool.query(
      "SELECT id, status, version FROM tickets WHERE id = $1", [ticket.id],
    );
    assert.deepEqual(rolledBackTicket, ticket);
    await copyFile(new URL(statusMigration, sourceMigrations), statusMigrationPath);
    migrate();

    const { rows: [upgraded] } = await pool.query(
      "SELECT id, status, version FROM tickets WHERE id = $1", [ticket.id],
    );
    assert.deepEqual(upgraded, {
      id: ticket.id,
      status: "done",
      version: ticket.version + 1,
    });
    await assert.rejects(
      pool.query("UPDATE tickets SET status = 'closed' WHERE id = $1", [ticket.id]),
      { code: "23514" },
    );
    const history = await pool.query("SELECT version, checksum FROM schema_migrations ORDER BY version");
    assert.deepEqual(history.rows.map(({ version }) => version), files.map((file) => file.slice(0, -4)));
    assert.ok(history.rows.every(({ checksum }) => /^[a-f0-9]{64}$/.test(checksum)));

    assert.equal(migrate().stdout.split("\n").filter((line) => line.startsWith("Verified and skipped")).length, files.length);
    const repeated = await pool.query("SELECT version, checksum FROM schema_migrations ORDER BY version");
    assert.deepEqual(repeated.rows, history.rows);

    await writeFile(join(migrations, "9998_rollback_probe.sql"), "CREATE TABLE rollback_probe (id integer);");
    await writeFile(join(migrations, "9999_failing_probe.sql"), "SELECT * FROM absent_migration_fixture;");
    assert.match(migrate(1).stderr, /absent_migration_fixture/);
    const rollback = await pool.query("SELECT to_regclass('rollback_probe') AS probe");
    assert.equal(rollback.rows[0].probe, null);
    const afterFailure = await pool.query("SELECT version, checksum FROM schema_migrations ORDER BY version");
    assert.deepEqual(afterFailure.rows, history.rows);
  } finally {
    try {
      await pool.end();
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await admin.end();
      await rm(workspace, { recursive: true, force: true });
    }
  }
});

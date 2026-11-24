import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { Pool } from "pg";

const migrationsDir = fileURLToPath(
  new URL("../../../db/migrations/", import.meta.url),
);

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

try {
  const files = (await readdir(migrationsDir))
    .filter((file) => /^\d+_[a-z0-9_]+\.sql$/.test(file))
    .sort();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Prevent concurrent migration runners.
    await client.query("SELECT pg_advisory_xact_lock(74004)");

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
  ALTER TABLE schema_migrations
  ADD COLUMN IF NOT EXISTS checksum TEXT
`);

    const { rows } = await client.query(
      "SELECT version, checksum FROM schema_migrations",
    );

    const applied = new Map(rows.map((row) => [row.version, row.checksum]));

    for (const file of files) {
      const version = file.slice(0, -4);

      const sql = await readFile(
        new URL(`../../../db/migrations/${file}`, import.meta.url),
        "utf8",
      );

      const checksum = createHash("sha256").update(sql).digest("hex");

      if (applied.has(version)) {
        const storedChecksum = applied.get(version);

        if (storedChecksum === null) {
          console.log(`Checksum not yet recorded for ${version}`);
        } else if (storedChecksum !== checksum) {
          throw new Error(
            `Checksum mismatch for ${version}. ` +
              "An applied migration file has changed.",
          );
        } else {
          console.log(`Verified and skipped ${version}`);
        }

        continue;
      }

      await client.query(sql);

      await client.query(
        `INSERT INTO schema_migrations (version, checksum)
   VALUES ($1, $2)`,
        [version, checksum],
      );

      console.log(`Applied ${version}`);
    }

    await client.query("COMMIT");
    console.log("Migrations complete.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

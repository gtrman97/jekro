
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { withTransaction } from "../dist/transaction.js";

test("rolls back database changes when an error occurs", async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const projectId = randomUUID();

  try {
    await assert.rejects(
      withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO projects (id, name)
           VALUES ($1, $2)`,
          [projectId, "Rollback test"]
        );

        throw new Error("Simulated failure");
      }),
      /Simulated failure/
    );

    const result = await pool.query(
      "SELECT id FROM projects WHERE id = $1",
      [projectId]
    );

    assert.equal(result.rows.length, 0);
  } finally {
    await pool.end();
  }
});

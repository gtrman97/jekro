import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { claimNextJob } from "../dist/claim-job.js";

test("two workers cannot claim the same job", async () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  // This test modifies data. Restrict it to our local DB.
  const url = new URL(databaseUrl);

  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/jekro"
  ) {
    throw new Error("Test requires the local Jekro database");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 2,
  });

  const projectId = randomUUID();
  const ticketId = randomUUID();
  const agentId = randomUUID();
  const actionId = randomUUID();
  const jobId = randomUUID();

  try {
    // Create isolated test records.
    await pool.query(
      "INSERT INTO projects (id, name) VALUES ($1, $2)",
      [projectId, "Concurrency Test"]
    );

    await pool.query(
      `INSERT INTO tickets (id, project_id, title)
       VALUES ($1, $2, $3)`,
      [ticketId, projectId, "Test Ticket"]
    );

    await pool.query(
      `INSERT INTO agents (id, project_id, name)
       VALUES ($1, $2, $3)`,
      [agentId, projectId, "Test Agent"]
    );

    await pool.query(
      `INSERT INTO actions (
        id, project_id, ticket_id,
        proposed_by_agent_id, idempotency_key,
        action_type, payload, preview,
        execution_class, effect_class,
        payload_hash, base_version,
        state, expires_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        'test_action', '{}'::jsonb, '{}'::jsonb,
        'internal', 'reversible',
        'test-hash', 1,
        'approved', NOW() + INTERVAL '1 hour'
      )`,
      [
        actionId,
        projectId,
        ticketId,
        agentId,
        randomUUID(),
      ]
    );

    await pool.query(
      `INSERT INTO jobs (id, action_id)
       VALUES ($1, $2)`,
      [jobId, actionId]
    );

    // Simulate two workers requesting work concurrently.
    const results = await Promise.all([
      claimNextJob(pool),
      claimNextJob(pool),
    ]);

    const successfulClaims = results.filter(
      (job) => job !== null
    );

    assert.equal(successfulClaims.length, 1);
    assert.equal(successfulClaims[0].id, jobId);

    const { rows } = await pool.query(
      `SELECT status, attempts, lease_token
       FROM jobs
       WHERE id = $1`,
      [jobId]
    );

    assert.equal(rows[0].status, "running");
    assert.equal(rows[0].attempts, 1);
    assert.ok(rows[0].lease_token);
  } finally {
    // Remove our temporary test records.
    try {
      await pool.query(
        "DELETE FROM jobs WHERE action_id = $1",
        [actionId]
      );
      await pool.query(
        "DELETE FROM actions WHERE id = $1",
        [actionId]
      );
      await pool.query(
        "DELETE FROM agents WHERE id = $1",
        [agentId]
      );
      await pool.query(
        "DELETE FROM tickets WHERE id = $1",
        [ticketId]
      );
      await pool.query(
        "DELETE FROM projects WHERE id = $1",
        [projectId]
      );
    } finally {
      await pool.end();
    }
  }
});

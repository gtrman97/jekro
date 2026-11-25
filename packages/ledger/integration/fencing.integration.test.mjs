
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { claimNextJob } from "../dist/claim-job.js";
import { completeJob } from "../dist/complete-job.js";

test("stale worker cannot complete a reclaimed job", async () => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const url = new URL(databaseUrl);

  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/jekro"
  ) {
    throw new Error("Use the local Jekro database");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  const projectId = randomUUID();
  const ticketId = randomUUID();
  const agentId = randomUUID();
  const actionId = randomUUID();
  const jobId = randomUUID();

  try {
    await pool.query(
      "INSERT INTO projects (id, name) VALUES ($1, $2)",
      [projectId, "Fencing Test"]
    );

    await pool.query(
      `INSERT INTO tickets (id, project_id, title)
       VALUES ($1, $2, $3)`,
      [ticketId, projectId, "Fencing Ticket"]
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
        actionId, projectId, ticketId,
        agentId, randomUUID(),
      ]
    );

    await pool.query(
      "INSERT INTO jobs (id, action_id) VALUES ($1, $2)",
      [jobId, actionId]
    );

    // Worker A claims the job.
    const workerA = await claimNextJob(pool);
    assert.ok(workerA);
    assert.equal(workerA.id, jobId);

    // Simulate its lease expiring.
    await pool.query(
      `UPDATE jobs
       SET lease_expires_at = NOW() - INTERVAL '1 second'
       WHERE id = $1`,
      [jobId]
    );

    // Worker B reclaims the same job.
    const workerB = await claimNextJob(pool);
    assert.ok(workerB);
    assert.equal(workerB.id, jobId);
    assert.notEqual(workerA.lease_token, workerB.lease_token);

    // Worker A's outdated token must be rejected.
    const staleCompletion = await completeJob(
      pool, jobId, workerA.lease_token
    );
    assert.equal(staleCompletion, false);

    // Worker B's current token must be accepted.
    const validCompletion = await completeJob(
      pool, jobId, workerB.lease_token
    );
    assert.equal(validCompletion, true);

    const { rows } = await pool.query(
      "SELECT status FROM jobs WHERE id = $1",
      [jobId]
    );
    assert.equal(rows[0].status, "completed");
  } finally {
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

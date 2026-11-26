import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { deadLetterExhaustedJobs } from "../dist/dead-letter-jobs.js";

test("dead-lettering updates jobs, actions and audit history", async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const url = new URL(databaseUrl);
  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/jekro_test"
  ) {
    throw new Error("Test requires local jekro_test");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  const projectId = randomUUID();
  const ticketId = randomUUID();
  const agentId = randomUUID();
  const expiredActionId = randomUUID();
  const activeActionId = randomUUID();

  try {
    await pool.query(
      "INSERT INTO projects (id, name) VALUES ($1, 'Dead Letter Test')",
      [projectId]
    );

    await pool.query(
      `INSERT INTO tickets (id, project_id, title)
       VALUES ($1, $2, 'Test Ticket')`,
      [ticketId, projectId]
    );

    await pool.query(
      `INSERT INTO agents (id, project_id, name)
       VALUES ($1, $2, 'Test Agent')`,
      [agentId, projectId]
    );

    // Create two approved actions.
    for (const actionId of [expiredActionId, activeActionId]) {
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
        [actionId, projectId, ticketId, agentId, randomUUID()]
      );
    }

    // First job: exhausted attempts, expired lease.
    await pool.query(
      `INSERT INTO jobs (
        action_id, status, attempts, max_attempts,
        lease_token, lease_expires_at
      ) VALUES (
        $1, 'running', 5, 5,
        $2, NOW() - INTERVAL '1 minute'
      )`,
      [expiredActionId, randomUUID()]
    );

    // Second job: exhausted attempts, active lease.
    await pool.query(
      `INSERT INTO jobs (
        action_id, status, attempts, max_attempts,
        lease_token, lease_expires_at
      ) VALUES (
        $1, 'running', 5, 5,
        $2, NOW() + INTERVAL '1 hour'
      )`,
      [activeActionId, randomUUID()]
    );

    const count = await deadLetterExhaustedJobs(pool);
    assert.equal(count, 1);

    const { rows } = await pool.query(
      `SELECT
        a.id,
        a.state,
        j.status AS job_status,
        (SELECT COUNT(*)::int
         FROM action_events e
         WHERE e.action_id = a.id
           AND e.event_type = 'job_dead_lettered'
           AND e.to_state = 'needs_review'
           AND e.actor_type = 'system'
           AND e.details->>'reason' =
               'retry_budget_exhausted') AS event_count
       FROM actions a
       JOIN jobs j ON j.action_id = a.id
       WHERE a.id IN ($1, $2)`,
      [expiredActionId, activeActionId]
    );

    const expired = rows.find(r => r.id === expiredActionId);
    const active = rows.find(r => r.id === activeActionId);

    assert.equal(expired.state, "needs_review");
    assert.equal(expired.job_status, "dead_letter");
    assert.equal(expired.event_count, 1);

    assert.equal(active.state, "approved");
    assert.equal(active.job_status, "running");
    assert.equal(active.event_count, 0);


    // Simulate an expired job with an invalid action state.
    await pool.query(
      `UPDATE jobs
       SET lease_expires_at = NOW() - INTERVAL '1 minute'
       WHERE action_id = $1`,
      [activeActionId]
    );

    await pool.query(
      `UPDATE actions
       SET state = 'proposed'
       WHERE id = $1`,
      [activeActionId]
    );

    // Dead-lettering must reject this inconsistency.
    await assert.rejects(
      deadLetterExhaustedJobs(pool),
      /Cannot dead-letter action in state: proposed/
    );

    // The job update must have been rolled back.
    const rollback = await pool.query(
      `SELECT
         j.status,
         a.state,
         (SELECT COUNT(*)::int
          FROM action_events
          WHERE action_id = a.id) AS event_count
       FROM jobs j
       JOIN actions a ON a.id = j.action_id
       WHERE a.id = $1`,
      [activeActionId]
    );

    assert.equal(rollback.rows[0].status, "running");
    assert.equal(rollback.rows[0].state, "proposed");
    assert.equal(rollback.rows[0].event_count, 0);


  } finally {
    try {
      // Dedicated disposable test database only.
      await pool.query(
        `TRUNCATE TABLE
          action_events, jobs, actions,
          agents, tickets, projects
         RESTART IDENTITY CASCADE`
      );
    } finally {
      await pool.end();
    }
  }
});

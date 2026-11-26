import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { lockTicketVersionForApproval } from "../../../apps/api/src/approval-target.ts";

import { DefaultLedgerService } from "../dist/service.js";

test("approval records an event and creates a job", async () => {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const url = new URL(databaseUrl);

  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/jekro_test"
  ) {
    throw new Error("This test requires local jekro_test");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  const projectId = randomUUID();
  const ticketId = randomUUID();
  const agentId = randomUUID();
  const actionId = randomUUID();

  // Only for this test, not production authorization.
  const authorizer = {
    async authorizeApproval() {},
  };

  const ledger = new DefaultLedgerService(pool, authorizer, lockTicketVersionForApproval);

  try {
    await pool.query(
      "INSERT INTO projects (id, name) VALUES ($1, 'Approval Test')",
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

    await pool.query(
      `INSERT INTO actions (
        id, project_id, ticket_id,
        proposed_by_agent_id, idempotency_key,
        action_type, payload, preview,
        execution_class, effect_class,
        payload_hash, base_version, expires_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        'test_action', '{}'::jsonb, '{}'::jsonb,
        'internal', 'reversible',
        'correct-hash', 1,
        NOW() + INTERVAL '1 hour'
      )`,
      [
        actionId,
        projectId,
        ticketId,
        agentId,
        randomUUID(),
      ]
    );

    // Approve the action.
    const approved = await ledger.approveAction(actionId, {
      projectId,
      actorType: "person",
      actorId: "test-user",
      approvedPayloadHash: "correct-hash",
    });

    assert.equal(approved.status, "approved");

    // Verify all three database results.
    const { rows } = await pool.query(
      `SELECT
         a.state,
         a.approved_at,
         (SELECT COUNT(*)::int
          FROM jobs
          WHERE action_id = a.id
            AND status = 'pending') AS job_count,
         (SELECT COUNT(*)::int
          FROM action_events
          WHERE action_id = a.id
            AND event_type = 'action_approved'
            AND actor_type = 'person'
            AND actor_id = 'test-user'
            AND from_state = 'proposed'
            AND to_state = 'approved'
            AND details->>'approved_payload_hash'
                = 'correct-hash') AS event_count
       FROM actions a
       WHERE a.id = $1`,
      [actionId]
    );

    assert.equal(rows[0].state, "approved");
    assert.ok(rows[0].approved_at);
    assert.equal(rows[0].job_count, 1);
    assert.equal(rows[0].event_count, 1);


    // Simulate failure at the final job-creation step.
    const failingActionId = randomUUID();

    await pool.query(
      `INSERT INTO actions (
        id, project_id, ticket_id,
        proposed_by_agent_id, idempotency_key,
        action_type, payload, preview,
        execution_class, effect_class,
        payload_hash, base_version, expires_at
      )
      SELECT
        $2, project_id, ticket_id,
        proposed_by_agent_id, $3,
        action_type, payload, preview,
        execution_class, effect_class,
        payload_hash, base_version, expires_at
      FROM actions
      WHERE id = $1`,
      [actionId, failingActionId, randomUUID()]
    );

    // Intentionally occupy the unique job slot.
    await pool.query(
      "INSERT INTO jobs (action_id) VALUES ($1)",
      [failingActionId]
    );

    // Approval will try to create another job and fail.
    await assert.rejects(
      ledger.approveAction(failingActionId, {
        projectId,
        actorType: "person",
        actorId: "test-user",
        approvedPayloadHash: "correct-hash",
      }),
      /duplicate key value/
    );

    // Check that the earlier changes were rolled back.
    const rollbackResult = await pool.query(
      `SELECT
         state,
         approved_at,
         (SELECT COUNT(*)::int
          FROM action_events
          WHERE action_id = $1) AS event_count,
         (SELECT COUNT(*)::int
          FROM jobs
          WHERE action_id = $1) AS job_count
       FROM actions
       WHERE id = $1`,
      [failingActionId]
    );

    assert.equal(rollbackResult.rows[0].state, "proposed");
    assert.equal(rollbackResult.rows[0].approved_at, null);
    assert.equal(rollbackResult.rows[0].event_count, 0);
    assert.equal(rollbackResult.rows[0].job_count, 1);


  } finally {
    try {
      // Only safe because this test uses a dedicated DB.
      // TRUNCATE bypasses the append-only DELETE trigger.
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
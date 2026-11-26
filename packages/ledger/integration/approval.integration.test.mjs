import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

import { lockTicketVersionForApproval } from "../../../apps/api/src/approval-target.ts";

import { DefaultLedgerService } from "../dist/service.js";

test("rejects invalid approvals without changing state, events, or jobs", async (t) => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const url = new URL(databaseUrl);

  if (
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/jekro"
  ) {
    throw new Error("Test requires the local Jekro database");
  }

  const pool = new Pool({ connectionString: databaseUrl });

  const projectId = randomUUID();
  const ticketId = randomUUID();
  const agentId = randomUUID();
  const actionId = randomUUID();

  // Test-only authorizer, not a production authorization policy.
  let authorizationCalls = 0;
  const authorizer = {
    async authorizeApproval() { authorizationCalls += 1; },
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
        payload_hash, base_version,
        expires_at
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

    await assert.rejects(
      ledger.approveAction(actionId, {
        projectId,
        actorType: "person",
        actorId: "test-user",
        approvedPayloadHash: "wrong-hash",
      }),
      /Approved payload does not match/
    );

    await t.test("rejects approval from another project before authorization", async () => {
      const before = authorizationCalls;
      await assert.rejects(
        ledger.approveAction(actionId, {
          projectId: randomUUID(),
          actorType: "person",
          actorId: "test-user",
          approvedPayloadHash: "correct-hash",
        }),
        /Action not found/,
      );
      assert.equal(authorizationCalls, before);
    });

    await t.test("rejects a stale proposal with the matching approval hash", async () => {
      await pool.query("UPDATE tickets SET version = version + 1 WHERE id = $1", [ticketId]);
      await assert.rejects(
        ledger.approveAction(actionId, {
          projectId,
          actorType: "person",
          actorId: "test-user",
          approvedPayloadHash: "correct-hash",
        }),
        /Action is stale/,
      );
    });

    const { rows } = await pool.query(
      `SELECT
         a.state,
         (SELECT COUNT(*)::int FROM jobs
          WHERE action_id = a.id) AS job_count,
         (SELECT COUNT(*)::int FROM action_events
          WHERE action_id = a.id) AS event_count
       FROM actions a
       WHERE a.id = $1`,
      [actionId]
    );

    assert.equal(rows[0].state, "proposed");
    assert.equal(rows[0].job_count, 0);
    assert.equal(rows[0].event_count, 0);
  } finally {
    try {
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

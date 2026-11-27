import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { DefaultLedgerService, hashProposal, sweepExpiredProposals } from "@jekro/ledger";
import { lockTicketVersionForApproval } from "../../../apps/api/src/approval-target.ts";
import { claimNextJob } from "../dist/claim-job.js";

test("ADR-0007 proposal lifecycle in PostgreSQL", async (t) => {
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
  assert.equal(url.pathname, "/jekro_test");
  const pool = new Pool({ connectionString: url.href });
  t.after(async () => {
    try {
      await pool.query("TRUNCATE action_events, jobs, actions, agents, tickets, projects CASCADE");
    } finally {
      await pool.end();
    }
  });
  const fixture = await pool.query(`
    WITH project AS (INSERT INTO projects (name) VALUES ('ADR-0007') RETURNING id),
    agent AS (
      INSERT INTO agents (name, project_id)
      SELECT 'Agent', id FROM project RETURNING id
    ), ticket AS (
      INSERT INTO tickets (title, project_id, version)
      SELECT 'Original', id, 3 FROM project RETURNING id
    ) SELECT project.id AS "projectId", agent.id AS "agentId", ticket.id AS "targetId"
      FROM project, agent, ticket`);
  const [scope] = fixture.rows;
  const authorizer = { async authorizeApproval(_client, _actionId, projectId, context) {
    assert.equal(projectId, scope.projectId);
    if (context.actorId === "denied") throw new Error("Forbidden");
  } };
  const updateTicket = (client, action) => client.query(
    "UPDATE tickets SET title = $1, version = version + 1 WHERE project_id = $2 AND id = $3",
    [action.payload.title, action.projectId, action.targetId],
  );
  const definitions = new Map([
    ["set_title", { staleness: "strict", effectClass: "reversible", execute: updateTicket }],
    ["append_note", { staleness: "none", effectClass: "compensatable",
      async execute(client, action) {
        await client.query(
          "UPDATE tickets SET title = title || $1, version = version + 1 WHERE project_id = $2 AND id = $3",
          [action.payload.title, action.projectId, action.targetId],
        );
      },
    }],
    ["expire_lease_after_effect", { staleness: "strict", effectClass: "reversible",
      async execute(client, action) {
        await updateTicket(client, action);
        await client.query(`UPDATE jobs SET lease_expires_at = clock_timestamp()
          FROM actions WHERE jobs.action_id = actions.id AND actions.project_id = $1
            AND actions.state = 'executing'`, [action.projectId]);
      },
    }],
    ["throw_after_effect", { staleness: "strict", effectClass: "reversible",
      async execute(client, action) {
        await updateTicket(client, action);
        throw new Error("Effect failed");
      },
    }],
  ]);
  const ledger = new DefaultLedgerService(pool, authorizer, lockTicketVersionForApproval, definitions);
  const input = (overrides = {}) => ({
    ...scope, actionType: "set_title", idempotencyKey: randomUUID(),
    payload: { title: "Proposed" }, preview: ["Original", "Proposed"], ...overrides,
  });
  const propose = async (request = input(), service = ledger) => {
    const { rows: [ticket] } = await pool.query("SELECT version FROM tickets WHERE id = $1", [scope.targetId]);
    return service.proposeAction({ baseVersion: ticket.version, ...request });
  };
  const approve = (proposal, overrides = {}, service = ledger) => service.approveAction(proposal.id, {
    projectId: scope.projectId, actorType: "person", actorId: "reviewer",
    approvedPayloadHash: proposal.payloadHash, ...overrides,
  });
  const events = async (proposal) => (await pool.query(
    "SELECT event_type, actor_type, actor_id, details FROM action_events WHERE action_id = $1 ORDER BY id",
    [proposal.id],
  )).rows;
  const snapshot = async (proposal) => (await pool.query(`
    SELECT a.state, j.status AS job_status FROM actions a
    LEFT JOIN jobs j ON j.action_id = a.id WHERE a.id = $1`, [proposal.id])).rows[0];
  const editTicket = (client = pool) => updateTicket(client, {
    ...scope, payload: { title: "Edited" },
  });

  await t.test("captures base version and default lifetime, with concurrent idempotent creation", async () => {
    const request = input({ baseVersion: 3 });
    const proposals = await Promise.all([ledger.proposeAction(request), ledger.proposeAction(request)]);
    const [proposal] = proposals;
    assert.deepEqual(proposals[1], proposal);
    assert.equal(proposal.payloadHash, hashProposal(request));
    assert.equal(proposal.baseVersion, 3);
    assert.equal(proposal.expiresAt - proposal.createdAt, 7 * 86_400_000);
    assert.equal((await events(proposal)).length, 1);
    await assert.rejects(ledger.proposeAction({ ...request, preview: { edited: true } }),
      { code: "idempotency_conflict" });
  });

  await t.test("rejects reuse for different and modified changes before approval", async () => {
    const original = await propose(input());
    const different = await propose(input({ payload: { title: "Different", number: 9007199254740992 } }));
    await assert.rejects(approve(different, { approvedPayloadHash: original.payloadHash }),
      { code: "proposal_changed" });
    await pool.query(`UPDATE actions SET payload = '{"title":"Different","number":9007199254740993}'::jsonb WHERE id = $1`,
      [different.id]);
    await assert.rejects(approve(different), { code: "proposal_changed" });
    await pool.query("UPDATE actions SET preview = 'null'::jsonb WHERE id = $1", [original.id]);
    await assert.rejects(approve(original), { code: "proposal_changed" });
    assert.deepEqual(await snapshot(original), { state: "proposed", job_status: null });
    assert.equal((await events(original)).length, 1);
  });

  await t.test("rejects both approver types after a concurrent ticket edit", async () => {
    const proposal = await propose(input());
    await assert.rejects(propose(input({ targetId: randomUUID() })), /target not found/);
    const editor = await pool.connect();
    try {
      await editor.query("BEGIN");
      await editTicket(editor);
      let signalLock;
      const atLock = new Promise((resolve) => { signalLock = resolve; });
      const concurrentLedger = new DefaultLedgerService(pool, authorizer, (...args) => {
        signalLock();
        return lockTicketVersionForApproval(...args);
      }, definitions);
      const human = assert.rejects(approve(proposal, {}, concurrentLedger), { code: "stale_proposal" });
      await atLock;
      await editor.query("COMMIT");
      await human;
      await assert.rejects(propose(input({ baseVersion: proposal.baseVersion })), { code: "stale_proposal" });
      await assert.rejects(approve(proposal, {
        actorType: "policy", actorId: "rule", policyVersion: "2",
      }), { code: "stale_proposal" });
      assert.deepEqual(await snapshot(proposal), { state: "proposed", job_status: null });
    } finally {
      await editor.query("ROLLBACK");
      editor.release();
    }
  });

  await t.test("records policy version and skips staleness only for a none action", async () => {
    const proposal = await propose(input({ actionType: "append_note" }));
    await editTicket();
    await assert.rejects(approve(proposal, { actorType: "policy", actorId: "rule" }), /rule version/);
    await assert.rejects(approve(proposal, { actorId: "denied" }), /Forbidden/);
    const attempts = await Promise.allSettled([
      approve(proposal, { actorType: "policy", actorId: "rule", policyVersion: "2" }),
      approve(proposal, { actorType: "policy", actorId: "rule", policyVersion: "2" }),
    ]);
    assert.equal(attempts.filter(({ status }) => status === "fulfilled").length, 1);
    assert.deepEqual((await events(proposal))[1], {
      event_type: "action_approved", actor_type: "policy", actor_id: "rule",
      details: { approved_payload_hash: proposal.payloadHash, policy_rule_version: "2" },
    });
    await editTicket();
    const job = await claimNextJob(pool);
    const wrongProject = randomUUID();
    await assert.rejects(ledger.executeAction(wrongProject, job.id, job.lease_token), /not found/);
    const result = await ledger.executeAction(scope.projectId, job.id, job.lease_token);
    assert.equal(result.status, "succeeded");
    const ticket = await pool.query("SELECT title FROM tickets WHERE id = $1", [scope.targetId]);
    assert.equal(ticket.rows[0].title, "EditedProposed");
    assert.deepEqual(await snapshot(proposal), { state: "succeeded", job_status: "completed" });
    await assert.rejects(ledger.executeAction(scope.projectId, job.id, job.lease_token), /not found/);
  });

  await t.test("uses database time for expiration and transitions overdue proposals once", async () => {
    const shortLived = new DefaultLedgerService(pool, authorizer, lockTicketVersionForApproval, definitions, 120);
    const onDemand = await propose(input(), shortLived);
    const swept = await propose(input(), shortLived);
    const approved = await propose(input(), shortLived);
    assert.equal(onDemand.expiresAt - onDemand.createdAt, 120_000);
    await approve(approved, {}, shortLived);
    await pool.query("UPDATE actions SET expires_at = statement_timestamp() WHERE id = ANY($1::uuid[])",
      [[onDemand.id, swept.id, approved.id]]);
    await assert.rejects(approve(onDemand, {}, shortLived), { code: "proposal_expired" });
    assert.equal(await sweepExpiredProposals(pool), 1);
    assert.equal(await sweepExpiredProposals(pool), 0);
    await assert.rejects(approve(swept, {
      actorType: "policy", actorId: "rule", policyVersion: "2",
    }), { code: "proposal_expired" });
    for (const proposal of [onDemand, swept]) {
      assert.deepEqual(await snapshot(proposal), { state: "expired", job_status: null });
      assert.deepEqual((await events(proposal)).map((event) => event.event_type),
        ["action_proposed", "action_expired"]);
    }
    const job = await claimNextJob(pool);
    assert.equal((await ledger.executeAction(scope.projectId, job.id, job.lease_token)).status, "succeeded");
  });

  await t.test("fails stale execution and rejects edits even when the stored hash is recomputed", async () => {
    const stale = await propose(input());
    await approve(stale);
    await editTicket();
    const changed = await propose(input());
    await approve(changed);
    const modified = { ...input(), payload: { title: "Unapproved" } };
    await pool.query("UPDATE actions SET payload = $1, payload_hash = $2 WHERE id = $3",
      [modified.payload, hashProposal(modified), changed.id]);
    for (const [proposal, cause] of [[stale, "stale_proposal"], [changed, "proposal_changed"]]) {
      const job = await claimNextJob(pool);
      assert.equal(job.action_id, proposal.id);
      const result = await ledger.executeAction(scope.projectId, job.id, job.lease_token);
      assert.equal(result.status, "failed");
      assert.deepEqual((await events(proposal)).at(-1).details, { cause });
      assert.deepEqual(await snapshot(proposal), { state: "failed", job_status: "completed" });
    }
    const ticket = await pool.query("SELECT title FROM tickets WHERE id = $1", [scope.targetId]);
    assert.equal(ticket.rows[0].title, "Edited");
  });

  await t.test("rolls back effect, execution events, and state on failure or lost lease", async () => {
    for (const [actionType, error] of [
      ["throw_after_effect", /Effect failed/],
      ["expire_lease_after_effect", /Execution lease lost/],
    ]) {
      const proposal = await propose(input({ actionType }));
      await approve(proposal);
      const job = await claimNextJob(pool);
      await assert.rejects(ledger.executeAction(scope.projectId, job.id, job.lease_token), error);
      const ticket = await pool.query("SELECT title, version FROM tickets WHERE id = $1", [scope.targetId]);
      assert.deepEqual(ticket.rows[0], { title: "Edited", version: proposal.baseVersion });
      assert.deepEqual(await snapshot(proposal), { state: "approved", job_status: "running" });
      assert.equal((await events(proposal)).length, 2);
    }
  });

});

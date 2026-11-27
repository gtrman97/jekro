import { sql } from "kysely";
import type { CompiledQuery, Kysely } from "kysely";
import type { Pool, PoolClient, QueryResultRow } from "pg";

import { completeJob } from "./complete-job.js";
import { createLedgerDatabase } from "./database.js";
import type { LedgerDatabase } from "./database.js";
import { expireProposal } from "./expire-proposals.js";
import { hashProposal } from "./proposal-hash.js";
import { withTransaction } from "./transaction.js";
import type {
  ActionDefinition,
  ApprovalAuthorizer,
  ApprovalContext,
  LedgerAction,
  LedgerProposal,
  LedgerService,
  LockApprovalTargetVersion,
  ProposalInput,
} from "./types.js";

const DEFAULT_PROPOSAL_TTL_SECONDS = 7 * 24 * 60 * 60;
const proposalFields = [
  "id", "state as status", "created_at as createdAt", "payload_hash as payloadHash",
  "base_version as baseVersion", "expires_at as expiresAt",
] as const;

// Execute Kysely statements on the client shared with application callbacks.
function query<Row extends QueryResultRow>(client: PoolClient, statement: CompiledQuery<Row>) {
  return client.query<Row>(statement.sql, [...statement.parameters]);
}

export class DefaultLedgerService implements LedgerService {
  private readonly db: Kysely<LedgerDatabase>;

  constructor(
    private readonly pool: Pool,
    private readonly authorizer: ApprovalAuthorizer,
    private readonly lockTargetVersion: LockApprovalTargetVersion,
    private readonly actions: ReadonlyMap<string, ActionDefinition>,
    private readonly proposalTtlSeconds = DEFAULT_PROPOSAL_TTL_SECONDS,
  ) {
    if (!Number.isSafeInteger(proposalTtlSeconds) || proposalTtlSeconds <= 0) {
      throw new Error("Proposal lifetime must be a positive integer in seconds");
    }
    this.db = createLedgerDatabase(pool);
  }

  private definition(actionType: string): ActionDefinition {
    const definition = this.actions.get(actionType);
    if (!definition) throw new Error("Unsupported action type");
    return definition;
  }

  private async agentIsActive(client: PoolClient, projectId: string, agentId: string) {
    const { rows: [agent] } = await query(client, this.db.selectFrom("agents")
      .select("is_active")
      .where("project_id", "=", projectId)
      .where("id", "=", agentId)
      .forShare()
      .compile());
    return agent?.is_active === true;
  }

  async proposeAction(input: ProposalInput): Promise<LedgerProposal> {
    const definition = this.definition(input.actionType);
    const payloadHash = hashProposal(input);
    const payload = JSON.stringify(input.payload);
    const preview = JSON.stringify(input.preview);

    return withTransaction(this.pool, async (client) => {
      if (!await this.agentIsActive(client, input.projectId, input.agentId)) {
        throw new Error("Proposing agent is inactive or outside the project");
      }
      const findExisting = async () => {
        const { rows: [existing] } = await query(client, this.db.selectFrom("actions")
          .select(proposalFields)
          .where("project_id", "=", input.projectId)
          .where("proposed_by_agent_id", "=", input.agentId)
          .where("idempotency_key", "=", input.idempotencyKey)
          .compile());
        if (existing && existing.payloadHash !== payloadHash) {
          throw new LedgerConflict("idempotency_conflict", "Idempotency key belongs to a different proposal");
        }
        return existing;
      };
      const existing = await findExisting();
      if (existing) return existing;

      const baseVersion = await this.lockTargetVersion(client, input.projectId, input.targetId);
      if (baseVersion === undefined) throw new Error("Proposal target not found");
      if (baseVersion !== input.baseVersion) {
        // A concurrent identical retry can still return the original proposal.
        const original = await findExisting();
        if (original) return original;
        throw new LedgerConflict("stale_proposal", "Action is stale: target version has changed");
      }

      const { rows: [proposal] } = await query(client, this.db.insertInto("actions")
        .values({
          project_id: input.projectId,
          ticket_id: input.targetId,
          proposed_by_agent_id: input.agentId,
          idempotency_key: input.idempotencyKey,
          action_type: input.actionType,
          payload: sql`${payload}::jsonb`,
          preview: sql`${preview}::jsonb`,
          execution_class: "internal",
          effect_class: definition.effectClass,
          payload_hash: payloadHash,
          base_version: baseVersion,
          expires_at: sql`statement_timestamp() + ${this.proposalTtlSeconds}::double precision * interval '1 second'`,
          created_at: sql`statement_timestamp()`,
        })
        .onConflict((conflict) => conflict
          .columns(["project_id", "proposed_by_agent_id", "idempotency_key"]).doNothing())
        .returning(proposalFields)
        .compile());

      if (!proposal) {
        const original = await findExisting();
        if (!original) throw new Error("Idempotent proposal disappeared");
        return original;
      }

      await query(client, this.db.insertInto("action_events").values({
        action_id: proposal.id,
        event_type: "action_proposed",
        from_state: null,
        to_state: "proposed",
        actor_type: "agent",
        actor_id: input.agentId,
        details: { payload_hash: payloadHash, base_version: baseVersion },
      }).compile());
      return proposal;
    });
  }

  private async lockAction(client: PoolClient, projectId: string, actionId: string) {
    const { rows: [action] } = await query(client, this.db.selectFrom("actions")
      .select([
        "id", "state", "payload_hash", "base_version", "ticket_id as targetId",
        "action_type as actionType", "payload", "preview", "execution_class",
        "project_id as projectId", "proposed_by_agent_id", "created_at",
      ])
      .where("project_id", "=", projectId)
      .where("id", "=", actionId)
      .forUpdate()
      .compile());
    if (!action) throw new Error("Action not found");
    return action;
  }

  private async matchesProposalHash(
    client: PoolClient,
    action: Awaited<ReturnType<DefaultLedgerService["lockAction"]>>,
    expectedHash: string | undefined,
  ) {
    if (expectedHash !== action.payload_hash) return false;

    // pg decodes JSONB numbers as JS numbers. Reject stored values that lose
    // precision on that round trip before hashing what the handler would see.
    const { rows: [stored] } = await query(client, this.db.selectFrom("actions")
      .select(sql<boolean>`payload = ${JSON.stringify(action.payload)}::jsonb
        AND preview = ${JSON.stringify(action.preview)}::jsonb`.as("exact"))
      .where("project_id", "=", action.projectId)
      .where("id", "=", action.id)
      .compile());
    return stored?.exact === true && hashProposal(action) === expectedHash;
  }

  async approveAction(actionId: string, context: ApprovalContext): Promise<LedgerAction> {
    const approved = await withTransaction(this.pool, async (client) => {
      const action = await this.lockAction(client, context.projectId, actionId);
      await this.authorizer.authorizeApproval(client, action.id, action.projectId, context);

      if (action.state === "expired") return null;
      if (action.state !== "proposed") throw new Error("Action is not awaiting approval");
      if (await expireProposal(client, action.projectId, action.id)) return null;
      if (!await this.matchesProposalHash(client, action, context.approvedPayloadHash)) {
        throw new LedgerConflict("proposal_changed", "Approved payload does not match the proposal");
      }
      if (!context.actorId.trim() || (context.actorType === "policy" && !context.policyVersion?.trim())) {
        throw new Error("Approval requires an actor identity and, for policies, a rule version");
      }
      if (!await this.agentIsActive(client, action.projectId, action.proposed_by_agent_id)) {
        throw new Error("Proposing agent is inactive");
      }

      const definition = this.definition(action.actionType);
      if (definition.staleness === "strict") {
        const version = await this.lockTargetVersion(client, action.projectId, action.targetId);
        // The ticket lock may have taken long enough for the proposal to expire.
        if (await expireProposal(client, action.projectId, action.id)) return null;
        if (version === undefined) throw new Error("Approval target not found");
        if (version !== action.base_version) {
          throw new LedgerConflict("stale_proposal", "Action is stale: target version has changed");
        }
      }

      const result = await query(client, this.db.updateTable("actions")
        .set({ state: "approved", approved_at: sql`statement_timestamp()` })
        .where("project_id", "=", action.projectId)
        .where("id", "=", action.id)
        .where("state", "=", "proposed")
        .where("expires_at", ">", sql<Date>`statement_timestamp()`)
        .compile());
      if (result.rowCount !== 1) {
        await expireProposal(client, action.projectId, action.id);
        return null;
      }

      await query(client, this.db.insertInto("action_events")
        .values({
          action_id: action.id,
          event_type: "action_approved",
          from_state: "proposed",
          to_state: "approved",
          actor_type: context.actorType,
          actor_id: context.actorId,
          details: {
            approved_payload_hash: context.approvedPayloadHash,
            ...(context.actorType === "policy" ? { policy_rule_version: context.policyVersion } : {}),
          },
        })
        .compile());
      await query(client, this.db.insertInto("jobs").values({ action_id: action.id }).compile());
      return { id: action.id, status: "approved" as const, createdAt: action.created_at };
    });
    // Report rejection after committing the expired state and its audit event.
    if (!approved) throw new LedgerConflict("proposal_expired", "Action has expired");
    return approved;
  }

  async executeAction(projectId: string, jobId: string, leaseToken: string): Promise<LedgerAction> {
    return withTransaction(this.pool, async (client) => {
      // Match dead-letter processing's job-before-action lock order.
      const { rows: [job] } = await client.query<{ action_id: string }>(
        `SELECT j.action_id FROM jobs j JOIN actions a ON a.id = j.action_id
         WHERE a.project_id = $1 AND j.id = $2 AND j.status = 'running'
           AND j.lease_token = $3 AND j.lease_expires_at > clock_timestamp()
         FOR UPDATE OF j`, [projectId, jobId, leaseToken],
      );
      if (!job) throw new Error("Execution job not found or lease lost");
      const action = await this.lockAction(client, projectId, job.action_id);
      if (action.state !== "approved" || action.execution_class !== "internal") {
        throw new Error("Action is not an approved internal action");
      }
      const { rows: [approval] } = await client.query<{ hash: string }>(
        `SELECT details->>'approved_payload_hash' AS hash FROM action_events
         WHERE action_id = $1 AND event_type = 'action_approved' ORDER BY id DESC LIMIT 1`,
        [action.id],
      );

      await query(client, this.db.updateTable("actions").set({ state: "executing" })
        .where("project_id", "=", projectId)
        .where("id", "=", action.id)
        .where("state", "=", "approved")
        .compile());
      await query(client, this.db.insertInto("action_events").values({
        action_id: action.id,
        event_type: "action_executing",
        from_state: "approved",
        to_state: "executing",
        actor_type: "system",
        actor_id: null,
        details: {},
      }).compile());

      let cause: string | undefined;
      if (!await this.matchesProposalHash(client, action, approval?.hash)) {
        cause = "proposal_changed";
      } else if (!await this.agentIsActive(client, action.projectId, action.proposed_by_agent_id)) {
        cause = "agent_revoked";
      } else {
        const definition = this.definition(action.actionType);
        if (definition.staleness === "strict") {
          const version = await this.lockTargetVersion(client, action.projectId, action.targetId);
          if (version !== action.base_version) cause = "stale_proposal";
        }
        if (!cause) await definition.execute(client, action);
      }

      const status = cause ? "failed" : "succeeded";
      await query(client, this.db.updateTable("actions").set({ state: status })
        .where("project_id", "=", projectId)
        .where("id", "=", action.id)
        .where("state", "=", "executing")
        .compile());
      await query(client, this.db.insertInto("action_events").values({
        action_id: action.id,
        event_type: cause ? "action_failed" : "action_succeeded",
        from_state: "executing",
        to_state: status,
        actor_type: "system",
        actor_id: null,
        details: cause ? { cause } : {},
      }).compile());
      if (!await completeJob(client, jobId, leaseToken)) throw new Error("Execution lease lost");
      return { id: action.id, status, createdAt: action.created_at };
    });
  }
}

export class LedgerConflict extends Error {
  readonly status = 409;

  constructor(
    readonly code: "idempotency_conflict" | "proposal_changed" | "proposal_expired" | "stale_proposal",
    message: string,
  ) {
    super(message);
  }
}

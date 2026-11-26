import { sql } from "kysely";
import type { InferResult, Kysely } from "kysely";
import type { Pool } from "pg";

import { createLedgerDatabase } from "./database.js";
import type { LedgerDatabase } from "./database.js";
import { withTransaction } from "./transaction.js";
import type {
  ApprovalAuthorizer,
  ApprovalContext,
  LedgerAction,
  LedgerService,
  LockApprovalTargetVersion,
} from "./types.js";

export class DefaultLedgerService implements LedgerService {
  private readonly db: Kysely<LedgerDatabase>;

  constructor(
    private readonly pool: Pool,
    private readonly authorizer: ApprovalAuthorizer,
    private readonly lockTargetVersion: LockApprovalTargetVersion,
  ) {
    this.db = createLedgerDatabase(pool);
  }

  async approveAction(
    actionId: string,
    context: ApprovalContext,
  ): Promise<LedgerAction> {
    return withTransaction(this.pool, async (client) => {
      // Execute the compiled statements on the client already held by the
      // approval transaction, including the existing authorization hook.
      const selectAction = this.db.selectFrom("actions")
        .select([
          "id", "state", "payload_hash", "base_version",
          "expires_at", "ticket_id as target_id", "project_id", "created_at",
        ])
        .where("project_id", "=", context.projectId)
        .where("id", "=", actionId)
        .forUpdate()
        .compile();
      const { rows: [action] } = await client.query<InferResult<typeof selectAction>[number]>(
        selectAction.sql, [...selectAction.parameters],
      );

      if (!action) {
        throw new Error("Action not found");
      }

      await this.authorizer.authorizeApproval(
        client, action.id, action.project_id, context,
      );

      if (action.state !== "proposed") {
        throw new Error("Action is not awaiting approval");
      }
      if (action.expires_at <= new Date()) {
        throw new Error("Action has expired");
      }
      if (action.payload_hash !== context.approvedPayloadHash) {
        throw new Error("Approved payload does not match the proposal");
      }

      const targetVersion = await this.lockTargetVersion(
        client, action.project_id, action.target_id,
      );
      if (targetVersion === undefined) {
        throw new Error("Approval target not found");
      }
      if (targetVersion !== action.base_version) {
        throw new Error("Action is stale: target version has changed");
      }

      const approve = this.db.updateTable("actions")
        .set({ state: "approved", approved_at: sql`now()` })
        .where("project_id", "=", context.projectId)
        .where("id", "=", action.id)
        .where("state", "=", "proposed")
        .compile();
      const { rowCount } = await client.query(approve.sql, [...approve.parameters]);
      if (rowCount !== 1) {
        throw new Error("Action is not awaiting approval");
      }

      const recordEvent = this.db.insertInto("action_events")
        .values({
          action_id: action.id,
          event_type: "action_approved",
          from_state: "proposed",
          to_state: "approved",
          actor_type: context.actorType,
          actor_id: context.actorId,
          details: { approved_payload_hash: context.approvedPayloadHash },
        })
        .compile();
      await client.query(recordEvent.sql, [...recordEvent.parameters]);

      const enqueue = this.db.insertInto("jobs")
        .values({ action_id: action.id })
        .compile();
      await client.query(enqueue.sql, [...enqueue.parameters]);

      return {
        id: action.id,
        status: "approved",
        createdAt: action.created_at,
      };
    });
  }
}

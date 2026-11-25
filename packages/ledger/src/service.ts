import type { Pool } from "pg";
import { withTransaction } from "./transaction.js";

import type {
  ApprovalAuthorizer,
  ApprovalContext,
  LedgerAction,
  LedgerService,
} from "./types.js";

export class DefaultLedgerService implements LedgerService {
  constructor(
    private readonly pool: Pool,
    private readonly authorizer: ApprovalAuthorizer,
  ) {}

  async approveAction(
    actionId: string,
    context: ApprovalContext,
  ): Promise<LedgerAction> {
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<{
        id: string;
        state: string;
        payload_hash: string;
        base_version: number;
        expires_at: Date;
        ticket_id: string;
        project_id: string;
        created_at: Date;
      }>(
        `SELECT
           id,
           state,
           payload_hash,
           base_version,
           expires_at,
           ticket_id,
           project_id,
           created_at
         FROM actions
         WHERE id = $1
         FOR UPDATE`,
        [actionId],
      );

      const action = result.rows[0];

      if (!action) {
        throw new Error("Action not found");
      }

      await this.authorizer.authorizeApproval(
        client,
        action.id,
        action.project_id,
        context,
      );

      // Check 1: Only proposed actions can be approved.
      if (action.state !== "proposed") {
        throw new Error("Action is not awaiting approval");
      }

      // Check 2: Expired proposals cannot be approved.
      if (action.expires_at <= new Date()) {
        throw new Error("Action has expired");
      }

      // Check 3: Approval must match the exact proposal.
      if (action.payload_hash !== context.approvedPayloadHash) {
        throw new Error("Approved payload does not match the proposal");
      }

      // More checks and job creation are still required.

      const ticketResult = await client.query<{
        version: number;
      }>(
        `SELECT version
          FROM tickets
          WHERE id = $1
          FOR UPDATE`,
        [action.ticket_id],
      );

      const ticket = ticketResult.rows[0];

      if (!ticket) {
        throw new Error("Ticket not found");
      }

      if (ticket.version !== action.base_version) {
        throw new Error("Action is stale: ticket version has changed");
      }

      // Authorization and job creation still need implementation.

      // 1. Record the approval on the action.
      await client.query(
        `UPDATE actions
         SET state = 'approved',
             approved_at = NOW()
         WHERE id = $1`,
        [action.id],
      );

      // 2. Record who approved which proposal.
      await client.query(
        `INSERT INTO action_events (
           action_id,
           event_type,
           from_state,
           to_state,
           actor_type,
           actor_id,
           details
         )
         VALUES (
           $1, 'action_approved',
           'proposed', 'approved',
           $2, $3, $4::jsonb
         )`,
        [
          action.id,
          context.actorType,
          context.actorId,
          JSON.stringify({
            approved_payload_hash: context.approvedPayloadHash,
          }),
        ],
      );

      // 3. Queue the action for execution.
      await client.query(
        `INSERT INTO jobs (action_id)
         VALUES ($1)`,
        [action.id],
      );

      return {
        id: action.id,
        status: "approved",
        createdAt: action.created_at,
      };
    });
  }
}

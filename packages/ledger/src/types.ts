import type { PoolClient } from "pg";

export type ActionStatus =
  | "proposed"
  | "approved"
  | "executing"
  | "succeeded"
  | "failed"
  | "rejected"
  | "expired"
  | "outcome_unknown"
  | "needs_review"
  | "compensating"
  | "compensated";

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export interface ProposedChange {
  actionType: string;
  targetId: string;
  payload: JsonValue;
  preview: JsonValue;
}

export interface ProposalInput extends ProposedChange {
  projectId: string;
  agentId: string;
  idempotencyKey: string;
  /** Target version used to prepare the payload and preview. */
  baseVersion: number;
}

export interface LedgerAction {
  id: string;
  status: ActionStatus;
  createdAt: Date;
}

export interface LedgerProposal extends LedgerAction {
  payloadHash: string;
  baseVersion: number;
  expiresAt: Date;
}

export type ApprovalContext = {
  projectId: string;
  approvedPayloadHash: string;
} & (
  | { actorType: "person"; actorId: string }
  | { actorType: "policy"; actorId: string; policyVersion: string }
);

export interface ApprovalAuthorizer {
  authorizeApproval(
    client: PoolClient,
    actionId: string,
    projectId: string,
    context: ApprovalContext,
  ): Promise<void>;
}

export interface ActionDefinition {
  staleness: "strict" | "none";
  effectClass: "reversible" | "compensatable" | "irreversible";
  execute(client: PoolClient, action: ProposedChange & { projectId: string }): Promise<void>;
}

export interface LedgerService {
  proposeAction(input: ProposalInput): Promise<LedgerProposal>;
  approveAction(actionId: string, context: ApprovalContext): Promise<LedgerAction>;
  executeAction(projectId: string, jobId: string, leaseToken: string): Promise<LedgerAction>;
}

/** Load the target version under a row lock on the active ledger transaction. */
export type LockApprovalTargetVersion = (
  client: PoolClient,
  projectId: string,
  targetId: string,
) => Promise<number | undefined>;

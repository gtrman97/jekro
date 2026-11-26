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


  export interface LedgerAction {
  id: string;
  status: ActionStatus;
  createdAt: Date;
}

export interface LedgerService {
  approveAction(
    actionId: string,
    context: ApprovalContext
  ): Promise<LedgerAction>;
}

export interface ApprovalContext {
  projectId: string;
  actorType: "person" | "policy";
  actorId: string;
  approvedPayloadHash: string;
}

export interface ApprovalAuthorizer {
  authorizeApproval(
    client: PoolClient,
    actionId: string,
    projectId: string,
    context: ApprovalContext
  ): Promise<void>;
}
/** Load the target version under a row lock on the active approval transaction. */
export type LockApprovalTargetVersion = (
  client: PoolClient,
  projectId: string,
  targetId: string,
) => Promise<number | undefined>;

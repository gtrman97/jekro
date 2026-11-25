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
  actorType: "person" | "policy";
  actorId: string;
  approvedPayloadHash: string;
}

import type { PoolClient } from "pg";

export interface ApprovalAuthorizer {
  authorizeApproval(
    client: PoolClient,
    actionId: string,
    projectId: string,
    context: ApprovalContext
  ): Promise<void>;
}
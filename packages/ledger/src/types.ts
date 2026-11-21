export type ActionStatus =
  | "proposed"
  | "approved"
  | "executing"
  | "succeeded"
  | "failed";

  export interface LedgerAction {
  id: string;
  status: ActionStatus;
  createdAt: Date;
}

export interface LedgerService {
  approveAction(actionId: string): Promise<LedgerAction>;
}
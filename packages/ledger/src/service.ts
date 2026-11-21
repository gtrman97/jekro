import type {
  LedgerAction,
  LedgerService,
} from "./types.js";

export class DefaultLedgerService implements LedgerService {
  async approveAction(
    actionId: string
  ): Promise<LedgerAction> {
    throw new Error(
      `Approval not implemented for action ${actionId}`
    );
  }
}
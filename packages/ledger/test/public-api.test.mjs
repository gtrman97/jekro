
import test from "node:test";
import assert from "node:assert/strict";

import { DefaultLedgerService } from "@jekro/ledger";

test("ledger exposes its public service class", () => {
  assert.equal(typeof DefaultLedgerService, "function");
});

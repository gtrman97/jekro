import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { hashProposal } from "@jekro/ledger";

test("proposal hashing is deterministic and binds every field", () => {
  const proposal = {
    actionType: "set_priority",
    targetId: "00000000-0000-0000-0000-00000000000a",
    payload: { b: 2, a: [1, null] },
    preview: { after: "high", before: "low" },
  };
  const canonical = '{"action_type":"set_priority","payload":{"a":[1,null],"b":2},"preview":{"after":"high","before":"low"},"target":"00000000-0000-0000-0000-00000000000a"}';
  const expected = createHash("sha256").update(canonical).digest("hex");
  assert.equal(hashProposal(proposal), expected);
  assert.equal(hashProposal({
    ...proposal, payload: { a: [1, null], b: 2 }, targetId: proposal.targetId.toUpperCase(),
  }), expected);
  for (const change of [
    { actionType: "add_comment" },
    { targetId: "00000000-0000-0000-0000-00000000000b" },
    { payload: { b: 2, a: [null, 1] } },
    { preview: { after: "medium", before: "low" } },
  ]) {
    assert.notEqual(hashProposal({ ...proposal, ...change }), expected);
  }
});

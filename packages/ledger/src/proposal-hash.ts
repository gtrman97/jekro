import { createHash } from "node:crypto";

import type { JsonValue, ProposedChange } from "./types.js";

function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  if (value !== null && typeof value === "object") {
    return "{" + Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    ).map(([key, item]) => JSON.stringify(key) + ":" + canonicalJson(item)).join(",") + "}";
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Proposal numbers must be finite");
  }
  return JSON.stringify(value);
}

export function hashProposal(change: ProposedChange): string {
  return createHash("sha256").update(canonicalJson({
    action_type: change.actionType,
    target: change.targetId.toLowerCase(),
    payload: change.payload,
    preview: change.preview,
  })).digest("hex");
}

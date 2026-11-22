import test from "node:test";
import assert from "node:assert/strict";

import {
  CreateTicketSchema,
  TicketStatusSchema,
} from "@jekro/shared";

test("API can import and validate shared ticket schemas", () => {
  const ticket = CreateTicketSchema.parse({
    title: "Build Jekro API",
  });

  assert.equal(ticket.title, "Build Jekro API");

  assert.equal(TicketStatusSchema.parse("open"), "open");
});

test("API rejects invalid ticket creation data", () => {
  const result = CreateTicketSchema.safeParse({
    title: "",
  });

  assert.equal(result.success, false);
});
import test from "node:test";
import assert from "node:assert/strict";

import {
  TicketStatusSchema,
  CreateTicketSchema,
} from "@jekro/shared";

test("accepts a valid ticket status", () => {
  assert.equal(TicketStatusSchema.parse("open"), "open");
});

test("rejects an invalid ticket status", () => {
  const result = TicketStatusSchema.safeParse("archived");

  assert.equal(result.success, false);
});

test("accepts a valid ticket creation request", () => {
  const result = CreateTicketSchema.parse({
    title: "Fix login button",
  });

  assert.deepEqual(result, {
    title: "Fix login button",
  });
});

test("rejects an empty ticket title", () => {
  const result = CreateTicketSchema.safeParse({
    title: "   ",
  });

  assert.equal(result.success, false);
});
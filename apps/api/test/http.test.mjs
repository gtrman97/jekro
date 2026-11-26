import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";

import { createApp } from "../src/server.ts";
import { handleError } from "../src/middleware/errors.ts";

async function listen(t, app = createApp()) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const { port } = server.address();
  return (path, options) => fetch(`http://127.0.0.1:${port}${path}`, options);
}

async function assertJson(response, status, body) {
  assert.equal(response.status, status);
  assert.match(response.headers.get("content-type"), /^application\/json\b/);
  assert.deepEqual(await response.json(), body);
}

test("serves the existing health endpoint", async (t) => {
  const request = await listen(t);
  await assertJson(await request("/health"), 200, { status: "ok" });
  await assertJson(await request("/health", {
    headers: { "If-None-Match": "*" },
  }), 200, { status: "ok" });
});

test("keeps unknown paths, path variants and unsupported methods as 404s", async (t) => {
  const request = await listen(t);
  for (const [method, path] of [
    ["GET", "/unknown"],
    ["GET", "/Health"],
    ["GET", "/health/"],
    ["GET", "/health?check=1"],
    ["OPTIONS", "/health"],
    ["GET", "/tickets"],
    ["POST", "/Tickets"],
    ["POST", "/tickets/"],
    ["POST", "/tickets?source=test"],
    ["OPTIONS", "/tickets"],
  ]) {
    await t.test(`${method} ${path}`, async () => {
      const options = { method };
      if (method === "POST") options.body = "{";
      await assertJson(await request(path, options), 404, { error: "Not found" });
    });
  }

  const head = await request("/health", { method: "HEAD" });
  assert.equal(head.status, 404);
  assert.equal(await head.text(), "");
});

test("returns the existing 501 for a valid ticket payload", async (t) => {
  const request = await listen(t);
  const payload = JSON.stringify({ title: "  Café 🐛  ", ignored: true });
  for (const [headers, body] of [
    [{ "Content-Type": "application/json" }, payload],
    [{ "Content-Type": "text/plain" }, payload],
    [{}, Buffer.from(payload)],
  ]) {
    await assertJson(await request("/tickets", {
      method: "POST",
      headers,
      body,
    }), 501, { error: "Ticket creation not implemented" });
  }
});

test("distinguishes malformed JSON from payloads rejected by Zod", async (t) => {
  const request = await listen(t);
  for (const [body, message] of [
    [undefined, "Invalid JSON request"],
    ["", "Invalid JSON request"],
    ["{invalid json", "Invalid JSON request"],
    ["null", "Invalid ticket data"],
    ["[]", "Invalid ticket data"],
    ['"title"', "Invalid ticket data"],
    ["{}", "Invalid ticket data"],
    ['{"title":15}', "Invalid ticket data"],
    ['{"title":"   "}', "Invalid ticket data"],
  ]) {
    await assertJson(await request("/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    }), 400, { error: message });
  }
});

test("returns a JSON 413 for oversized ticket bodies", async (t) => {
  const request = await listen(t);
  await assertJson(await request("/tickets", {
    method: "POST",
    body: JSON.stringify({ title: "a".repeat(100 * 1024) }),
  }), 413, { error: "Request body too large" });
});

test("Express forwards rejected async handlers to the central error middleware", async (t) => {
  const app = express();
  app.get("/test-error", async () => {
    await Promise.resolve();
    throw new Error("private failure details");
  });
  app.use(handleError);

  const request = await listen(t, app);
  await assertJson(await request("/test-error"), 500, { error: "Internal server error" });
});

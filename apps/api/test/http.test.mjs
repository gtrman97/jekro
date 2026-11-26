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

test("serves health using Express pathname matching", async (t) => {
  const request = await listen(t);
  for (const path of ["/health", "/Health", "/health/", "/health?check=1"]) {
    await assertJson(await request(path), 200, { status: "ok" });
  }

  const head = await request("/health", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});

test("Express answers OPTIONS for known routes", async (t) => {
  const request = await listen(t);
  for (const [path, methods] of [["/health", ["GET", "HEAD"]], ["/tickets", ["POST"]]]) {
    const response = await request(path, { method: "OPTIONS" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.headers.get("allow")?.split(/,\s*/).sort(), methods);
    await response.text();
  }
});

test("returns JSON 404 for unknown routes and unmatched methods", async (t) => {
  const request = await listen(t);
  for (const [method, path] of [
    ["GET", "/unknown"],
    ["OPTIONS", "/unknown"],
    ["GET", "/tickets"],
    ["POST", "/unknown"],
  ]) {
    await assertJson(await request(path, { method }), 404, { error: "Not found" });
  }
});

test("returns the existing 501 for a valid ticket payload", async (t) => {
  const request = await listen(t);
  await assertJson(await request("/Tickets/?source=test", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ title: "  Café 🐛  ", ignored: true }),
  }), 501, { error: "Ticket creation not implemented" });
});

test("requires application/json on the ticket route", async (t) => {
  const request = await listen(t);
  for (const headers of [{ "Content-Type": "text/plain" }, {}]) {
    await assertJson(await request("/tickets", {
      method: "POST",
      headers,
      body: Buffer.from('{"title":"Build Jekro"}'),
    }), 415, { error: "Content-Type must be application/json" });
  }

  await assertJson(await request("/tickets", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=iso-8859-1" },
    body: '{"title":"Build Jekro"}',
  }), 415, { error: "Unsupported charset or content encoding" });
});

test("distinguishes malformed JSON from payloads rejected by Zod", async (t) => {
  const request = await listen(t);
  for (const [body, message] of [
    [undefined, "Invalid ticket data"],
    ["", "Invalid ticket data"],
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

test("accepts ticket bodies up to 100 KiB and returns a JSON 413 above it", async (t) => {
  const request = await listen(t);
  const overhead = Buffer.byteLength(JSON.stringify({ title: "" }));
  const title = "a".repeat(100 * 1024 - overhead);
  const headers = { "Content-Type": "application/json" };

  await assertJson(await request("/tickets", {
    method: "POST",
    headers,
    body: JSON.stringify({ title }),
  }), 501, { error: "Ticket creation not implemented" });

  await assertJson(await request("/tickets", {
    method: "POST",
    headers,
    body: JSON.stringify({ title: title + "a" }),
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

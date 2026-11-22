import test from "node:test";
import assert from "node:assert/strict";

import { createAppServer } from "../src/server.ts";

test("API validates incoming HTTP requests", async () => {
  const server = createAppServer();

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();

    assert.ok(address);
    assert.notEqual(typeof address, "string");

    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${baseUrl}/health`);
    assert.equal(health.status, 200);

    const invalid = await fetch(`${baseUrl}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });

    assert.equal(invalid.status, 400);

    const valid = await fetch(`${baseUrl}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Build Jekro" }),
    });

    assert.equal(valid.status, 501);

    const malformed = await fetch(`${baseUrl}/tickets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{invalid json",
    });

    assert.equal(malformed.status, 400);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
});
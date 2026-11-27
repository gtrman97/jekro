import { setTimeout } from "node:timers/promises";

import { sweepExpiredProposals } from "@jekro/ledger";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const pool = new pg.Pool({ connectionString });
const shutdown = new AbortController();
process.once("SIGINT", () => shutdown.abort());
process.once("SIGTERM", () => shutdown.abort());

try {
  while (!shutdown.signal.aborted) {
    await sweepExpiredProposals(pool);
    await setTimeout(60_000, undefined, { signal: shutdown.signal });
  }
} catch (error) {
  if (!shutdown.signal.aborted || !(error instanceof Error) || error.name !== "AbortError") {
    throw error;
  }
} finally {
  await pool.end();
}

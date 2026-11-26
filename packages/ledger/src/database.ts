import { Kysely, PostgresDialect } from "kysely";
import type { Generated } from "kysely";
import type { Pool } from "pg";

import type { ActionStatus } from "./types.js";

// Approval uses this projection of db/migrations/0004_create_actions_and_jobs.sql.
interface Actions {
  id: string;
  project_id: string;
  ticket_id: string;
  state: ActionStatus;
  payload_hash: string;
  base_version: number;
  expires_at: Date;
  approved_at: Date | null;
  created_at: Date;
}

interface ActionEvents {
  action_id: string;
  event_type: string;
  from_state: ActionStatus;
  to_state: ActionStatus;
  actor_type: "person" | "policy";
  actor_id: string;
  details: { approved_payload_hash: string };
}

interface Jobs {
  id: Generated<string>;
  action_id: string;
}

export interface LedgerDatabase {
  actions: Actions;
  action_events: ActionEvents;
  jobs: Jobs;
}

export function createLedgerDatabase(pool: Pool): Kysely<LedgerDatabase> {
  return new Kysely({ dialect: new PostgresDialect({ pool }) });
}

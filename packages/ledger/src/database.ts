import { Kysely, PostgresDialect } from "kysely";
import type { Generated } from "kysely";
import type { Pool } from "pg";

import type { ActionDefinition, ActionStatus, JsonValue } from "./types.js";

interface Actions {
  id: Generated<string>;
  project_id: string;
  ticket_id: string;
  proposed_by_agent_id: string;
  idempotency_key: string;
  action_type: string;
  payload: JsonValue;
  preview: JsonValue;
  execution_class: string;
  effect_class: ActionDefinition["effectClass"];
  state: Generated<ActionStatus>;
  payload_hash: string;
  base_version: number;
  expires_at: Date;
  approved_at: Date | null;
  created_at: Generated<Date>;
}

interface ActionEvents {
  action_id: string;
  event_type: string;
  from_state: ActionStatus | null;
  to_state: ActionStatus;
  actor_type: "person" | "policy" | "agent" | "system";
  actor_id: string | null;
  details: Record<string, JsonValue>;
}

interface Jobs {
  id: Generated<string>;
  action_id: string;
}

interface Agents {
  id: string;
  project_id: string;
  is_active: boolean;
}

export interface LedgerDatabase {
  actions: Actions;
  action_events: ActionEvents;
  agents: Agents;
  jobs: Jobs;
}

export function createLedgerDatabase(pool: Pool): Kysely<LedgerDatabase> {
  return new Kysely({ dialect: new PostgresDialect({ pool }) });
}

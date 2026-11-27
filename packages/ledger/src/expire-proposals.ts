import type { Pool, PoolClient } from "pg";

const expireAndAudit = (selection: string) => `
  WITH due AS (${selection}),
  expired AS (
    UPDATE actions SET state = 'expired'
    FROM due WHERE actions.id = due.id
    RETURNING actions.id
  )
  INSERT INTO action_events (action_id, event_type, from_state, to_state, actor_type)
  SELECT id, 'action_expired', 'proposed', 'expired', 'system' FROM expired`;

export async function expireProposal(client: PoolClient, projectId: string, actionId: string) {
  const result = await client.query(expireAndAudit(`
    SELECT id FROM actions WHERE project_id = $1 AND id = $2
      AND state = 'proposed' AND expires_at <= statement_timestamp()
    FOR UPDATE`), [projectId, actionId]);
  return result.rowCount === 1;
}

/** System maintenance across all projects. Each call handles one bounded batch. */
export async function sweepExpiredProposals(pool: Pool): Promise<number> {
  const result = await pool.query(expireAndAudit(`
    SELECT id FROM actions WHERE state = 'proposed' AND expires_at <= statement_timestamp()
    ORDER BY expires_at, id LIMIT 100 FOR UPDATE SKIP LOCKED`));
  return result.rowCount ?? 0;
}

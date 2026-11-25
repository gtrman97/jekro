
import type { Pool } from "pg";
import { withTransaction } from "./transaction.js";

interface ExhaustedJob {
  id: string;
  action_id: string;
  attempts: number;
  max_attempts: number;
}

export async function deadLetterExhaustedJobs(
  pool: Pool
): Promise<number> {
  return withTransaction(pool, async (client) => {
    // 1. Find exhausted jobs and mark them dead-letter.
    const result = await client.query<ExhaustedJob>(`
      UPDATE jobs
      SET
        status = 'dead_letter',
        lease_token = NULL,
        lease_expires_at = NULL
      WHERE attempts >= max_attempts
        AND (
          status = 'pending'
          OR (
            status = 'running'
            AND lease_expires_at < NOW()
          )
        )
      RETURNING id, action_id, attempts, max_attempts
    `);

    // 2. Update the action and its audit history.
    for (const job of result.rows) {
      const actionResult = await client.query<{
        state: string;
      }>(
        `SELECT state
         FROM actions
         WHERE id = $1
         FOR UPDATE`,
        [job.action_id]
      );

      const previousState = actionResult.rows[0]?.state;

      if (
        previousState !== "approved" &&
        previousState !== "executing"
      ) {
        throw new Error(
          `Cannot dead-letter action in state: ${previousState}`
        );
      }

      await client.query(
        `UPDATE actions
         SET state = 'needs_review'
         WHERE id = $1`,
        [job.action_id]
      );

      await client.query(
        `INSERT INTO action_events (
          action_id,
          event_type,
          from_state,
          to_state,
          actor_type,
          details
        )
        VALUES (
          $1,
          'job_dead_lettered',
          $2,
          'needs_review',
          'system',
          $3::jsonb
        )`,
        [
          job.action_id,
          previousState,
          JSON.stringify({
            job_id: job.id,
            attempts: job.attempts,
            max_attempts: job.max_attempts,
            reason: "retry_budget_exhausted",
          }),
        ]
      );
    }

    return result.rowCount ?? 0;
  });
}
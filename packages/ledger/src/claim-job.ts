import type { Pool } from "pg";

export interface ClaimedJob {
  id: string;
  action_id: string;
  attempts: number;
  lease_token: string;
  lease_expires_at: Date;
}

export async function claimNextJob(pool: Pool): Promise<ClaimedJob | null> {
  const result = await pool.query<ClaimedJob>(`
    WITH next_job AS (
      SELECT id
      FROM jobs
      
    WHERE (
        status = 'pending'
        OR (
            status = 'running'
            AND lease_expires_at < NOW()
        )
    )
    AND available_at <= NOW()
    AND attempts < max_attempts

      ORDER BY available_at, created_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE jobs AS j
    SET
      status = 'running',
      attempts = j.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = NOW() + INTERVAL '60 seconds'
    FROM next_job
    WHERE j.id = next_job.id
    RETURNING
      j.id,
      j.action_id,
      j.attempts,
      j.lease_token,
      j.lease_expires_at
  `);

  return result.rows[0] ?? null;
}

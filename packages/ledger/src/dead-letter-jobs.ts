import type { Pool } from "pg";

export async function deadLetterExhaustedJobs(
  pool: Pool
): Promise<number> {
  const result = await pool.query(`
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
    RETURNING id
  `);

  return result.rowCount ?? 0;
}

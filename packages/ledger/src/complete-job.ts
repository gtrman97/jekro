import type { Pool } from "pg";

export async function completeJob(
  pool: Pool,
  jobId: string,
  leaseToken: string
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE jobs
     SET
       status = 'completed',
       lease_token = NULL,
       lease_expires_at = NULL
     WHERE id = $1
       AND status = 'running'
       AND lease_token = $2
       AND lease_expires_at > NOW()
     RETURNING id`,
    [jobId, leaseToken]
  );

  return result.rowCount === 1;
}

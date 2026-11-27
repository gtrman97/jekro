import type { Pool, PoolClient } from "pg";

export async function completeJob(
  db: Pool | PoolClient,
  jobId: string,
  leaseToken: string
): Promise<boolean> {
  const result = await db.query(
    `UPDATE jobs
     SET
       status = 'completed',
       lease_token = NULL,
       lease_expires_at = NULL
     WHERE id = $1
       AND status = 'running'
       AND lease_token = $2
       AND lease_expires_at > clock_timestamp()
     RETURNING id`,
    [jobId, leaseToken]
  );

  return result.rowCount === 1;
}

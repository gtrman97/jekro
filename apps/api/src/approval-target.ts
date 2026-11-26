import type { PoolClient } from "pg";

export async function lockTicketVersionForApproval(
  client: PoolClient,
  projectId: string,
  ticketId: string,
): Promise<number | undefined> {
  const { rows: [ticket] } = await client.query<{ version: number }>(
    `SELECT version
     FROM tickets
     WHERE project_id = $1 AND id = $2
     FOR UPDATE`,
    [projectId, ticketId],
  );
  return ticket?.version;
}

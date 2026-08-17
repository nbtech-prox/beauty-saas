export interface AuditLogRecord {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload: unknown;
  occurredAt: Date;
}

export interface RecordAuditLogInput {
  tenantId: string | null;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  payload?: unknown;
}

export interface ListAuditLogsOptions {
  limit?: number;
  offset?: number;
}

interface AuditLogRow {
  id: string;
  tenant_id: string | null;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: unknown;
  occurred_at: Date;
}

function mapAuditLog(row: AuditLogRow): AuditLogRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    actorUserId: row.actor_user_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    payload: row.payload,
    occurredAt: row.occurred_at,
  };
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function recordAuditLog(
  pool: import('./executor.js').QueryExecutor,
  input: RecordAuditLogInput,
): Promise<AuditLogRecord> {
  const result = await pool.query<AuditLogRow>(
    `INSERT INTO audit_logs (
       tenant_id, actor_user_id, action, entity_type, entity_id, payload
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [
      input.tenantId,
      input.actorUserId,
      input.action,
      input.entityType,
      input.entityId,
      JSON.stringify(input.payload ?? {}),
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error('recordAuditLog não devolveu nenhum registo.');
  return mapAuditLog(row);
}

export async function listAuditLogsByTenant(
  pool: import('./executor.js').QueryExecutor,
  tenantId: string,
  options: ListAuditLogsOptions = {},
): Promise<AuditLogRecord[]> {
  const limit = clampLimit(options.limit ?? DEFAULT_LIMIT);
  const offset = Math.max(0, options.offset ?? 0);

  const result = await pool.query<AuditLogRow>(
    `SELECT *
       FROM audit_logs
      WHERE tenant_id = $1
      ORDER BY occurred_at DESC
      LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset],
  );
  return result.rows.map(mapAuditLog);
}

function clampLimit(value: number): number {
  if (!Number.isInteger(value) || value <= 0) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

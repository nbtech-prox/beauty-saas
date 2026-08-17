export type WebhookSignatureStatus =
  'verified' | 'invalid_signature' | 'invalid_config';

export type WebhookProcessingStatus =
  'pending' | 'processing' | 'processed' | 'failed' | 'ignored';

export interface WebhookEventRecord {
  id: string;
  provider: string;
  eventId: string;
  eventType: string;
  tenantId: string | null;
  payload: unknown;
  signatureStatus: WebhookSignatureStatus;
  receivedAt: Date;
  processedAt: Date | null;
  processingStatus: WebhookProcessingStatus;
  attemptCount: number;
  lastError: string | null;
}

export interface RecordWebhookEventInput {
  provider: string;
  eventId: string;
  eventType: string;
  tenantId: string | null;
  payload: unknown;
  signatureStatus: WebhookSignatureStatus;
}

export interface RecordWebhookEventResult {
  id: string;
  wasInserted: boolean;
}

interface WebhookEventRow {
  id: string;
  provider: string;
  event_id: string;
  event_type: string;
  tenant_id: string | null;
  payload: unknown;
  signature_status: WebhookSignatureStatus;
  received_at: Date;
  processed_at: Date | null;
  processing_status: WebhookProcessingStatus;
  attempt_count: number;
  last_error: string | null;
}

function mapWebhookEvent(row: WebhookEventRow): WebhookEventRecord {
  return {
    id: row.id,
    provider: row.provider,
    eventId: row.event_id,
    eventType: row.event_type,
    tenantId: row.tenant_id,
    payload: row.payload,
    signatureStatus: row.signature_status,
    receivedAt: row.received_at,
    processedAt: row.processed_at,
    processingStatus: row.processing_status,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
  };
}

export async function recordWebhookEvent(
  pool: import('./executor.js').QueryExecutor,
  provider: string,
  eventId: string,
  eventType: string,
  tenantId: string | null,
  payload: unknown,
  signatureStatus: WebhookSignatureStatus,
): Promise<RecordWebhookEventResult> {
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO webhook_events (
       provider, event_id, event_type, tenant_id,
       payload, signature_status
     )
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (provider, event_id) DO NOTHING
     RETURNING id`,
    [
      provider,
      eventId,
      eventType,
      tenantId,
      JSON.stringify(payload ?? {}),
      signatureStatus,
    ],
  );

  const insertedRow = inserted.rows[0];
  if (insertedRow) {
    return { id: insertedRow.id, wasInserted: true };
  }

  // Duplicado: devolve o id do registo já existente para idempotência.
  const existente = await pool.query<{ id: string }>(
    `SELECT id FROM webhook_events WHERE provider = $1 AND event_id = $2`,
    [provider, eventId],
  );
  const existing = existente.rows[0];
  if (!existing)
    throw new Error(
      'recordWebhookEvent não conseguiu localizar o registo após um conflito.',
    );
  return { id: existing.id, wasInserted: false };
}

export async function markWebhookProcessed(
  pool: import('./executor.js').QueryExecutor,
  id: string,
): Promise<void> {
  await pool.query(
    `UPDATE webhook_events
        SET processing_status = 'processed',
            processed_at = NOW(),
            attempt_count = attempt_count + 1
      WHERE id = $1`,
    [id],
  );
}

export async function markWebhookFailed(
  pool: import('./executor.js').QueryExecutor,
  id: string,
  error: string,
): Promise<void> {
  await pool.query(
    `UPDATE webhook_events
        SET processing_status = 'failed',
            processed_at = NOW(),
            attempt_count = attempt_count + 1,
            last_error = $2
      WHERE id = $1`,
    [id, error],
  );
}

export async function findWebhookEvent(
  pool: import('./executor.js').QueryExecutor,
  provider: string,
  eventId: string,
): Promise<WebhookEventRecord | undefined> {
  const result = await pool.query<WebhookEventRow>(
    `SELECT *
       FROM webhook_events
      WHERE provider = $1 AND event_id = $2`,
    [provider, eventId],
  );
  const row = result.rows[0];
  return row ? mapWebhookEvent(row) : undefined;
}

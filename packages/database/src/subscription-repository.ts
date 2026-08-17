export type SubscriptionPlanCode =
  | 'starter-monthly'
  | 'starter-yearly'
  | 'pro-monthly'
  | 'pro-yearly'
  | 'enterprise-monthly'
  | 'enterprise-yearly';

export type SubscriptionStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export interface SubscriptionRecord {
  id: string;
  tenantId: string;
  planCode: SubscriptionPlanCode;
  stripePriceId: string;
  externalId: string;
  externalCustomerId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd: Date | null;
  cancelAt: Date | null;
  canceledAt: Date | null;
}

export interface UpsertSubscriptionInput {
  tenantId: string;
  planCode: SubscriptionPlanCode;
  stripePriceId: string;
  externalId: string;
  externalCustomerId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEnd?: Date | null;
  cancelAt?: Date | null;
  canceledAt?: Date | null;
}

interface SubscriptionRow {
  id: string;
  tenant_id: string;
  plan_code: SubscriptionPlanCode;
  stripe_price_id: string;
  external_id: string;
  external_customer_id: string;
  status: SubscriptionStatus;
  current_period_start: Date;
  current_period_end: Date;
  trial_end: Date | null;
  cancel_at: Date | null;
  canceled_at: Date | null;
}

function mapSubscription(row: SubscriptionRow): SubscriptionRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    planCode: row.plan_code,
    stripePriceId: row.stripe_price_id,
    externalId: row.external_id,
    externalCustomerId: row.external_customer_id,
    status: row.status,
    currentPeriodStart: row.current_period_start,
    currentPeriodEnd: row.current_period_end,
    trialEnd: row.trial_end,
    cancelAt: row.cancel_at,
    canceledAt: row.canceled_at,
  };
}

export async function upsertSubscription(
  pool: import('./executor.js').QueryExecutor,
  input: UpsertSubscriptionInput,
): Promise<SubscriptionRecord> {
  const result = await pool.query<SubscriptionRow>(
    `INSERT INTO subscriptions (
       tenant_id, plan_code, stripe_price_id, external_id,
       external_customer_id, status, current_period_start,
       current_period_end, trial_end, cancel_at, canceled_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (external_id) DO UPDATE SET
       stripe_price_id = EXCLUDED.stripe_price_id,
       status = EXCLUDED.status,
       current_period_start = EXCLUDED.current_period_start,
       current_period_end = EXCLUDED.current_period_end,
       trial_end = EXCLUDED.trial_end,
       cancel_at = EXCLUDED.cancel_at,
       canceled_at = EXCLUDED.canceled_at,
       updated_at = NOW()
     RETURNING *`,
    [
      input.tenantId,
      input.planCode,
      input.stripePriceId,
      input.externalId,
      input.externalCustomerId,
      input.status,
      input.currentPeriodStart,
      input.currentPeriodEnd,
      input.trialEnd ?? null,
      input.cancelAt ?? null,
      input.canceledAt ?? null,
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error('upsertSubscription não devolveu nenhum registo.');
  return mapSubscription(row);
}

export async function getSubscriptionByExternalId(
  pool: import('./executor.js').QueryExecutor,
  externalId: string,
): Promise<SubscriptionRecord | null> {
  const result = await pool.query<SubscriptionRow>(
    `SELECT * FROM subscriptions WHERE external_id = $1`,
    [externalId],
  );
  const row = result.rows[0];
  return row ? mapSubscription(row) : null;
}

export async function listSubscriptionsByTenantAndStatuses(
  pool: import('./executor.js').QueryExecutor,
  tenantId: string,
  statuses: readonly SubscriptionStatus[],
): Promise<SubscriptionRecord[]> {
  const result = await pool.query<SubscriptionRow>(
    `SELECT *
       FROM subscriptions
      WHERE tenant_id = $1
        AND status = ANY($2::text[])
      ORDER BY created_at DESC`,
    [tenantId, statuses],
  );
  return result.rows.map(mapSubscription);
}

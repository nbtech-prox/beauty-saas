/**
 * `processStripeWebhook` — pipeline idempotente para webhooks Stripe.
 *
 * Responsabilidades:
 *  1. Registar o evento na tabela `webhook_events` (UNIQUE (provider, event_id))
 *     — se já existir, devolve `deduped` e termina.
 *  2. Despachar o handler apropriado por `dispatchKind` (subscription.*,
 *     invoice.*, checkout.session.completed, …).
 *  3. Persistir side-effects (subscription, tenant.status, audit log) numa
 *     única transacção. Em caso de erro, escreve WebhookEvent.processing_status
 *     = 'failed' numa transacção separada (best-effort) e propaga.
 *
 * Aceita `pool` quer como `Pool` (cria o client) quer como `PoolClient`
 * (reutiliza a transacção). Esta flexibilidade permite testes unitários
 * sem mockar o `pool.connect()`.
 */
import type { Pool, PoolClient } from 'pg';
import {
  recordAuditLog,
  recordWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
} from '@beauty-saas/database';
import type { StripeWebhookEvent } from '@beauty-saas/billing/webhooks';

export type ProcessResult =
  | { kind: 'processed'; dispatch: string }
  | { kind: 'ignored'; dispatch: string }
  | { kind: 'deduped'; dispatch: string; deduped: true };

export type DispatchKind =
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.deleted'
  | 'invoice.payment_failed'
  | 'invoice.paid'
  | 'checkout.session.completed'
  | 'ignored';

export interface ProcessStripeWebhookInput {
  pool: Pool | PoolClient;
  event: StripeWebhookEvent;
  dispatchKind: DispatchKind;
}

export async function processStripeWebhook(
  pool: Pool | PoolClient,
  event: StripeWebhookEvent,
  dispatchKind: DispatchKind,
): Promise<ProcessResult> {
  const independent = await ensureClient(pool);
  const tx = independent.client;
  const ownsConnection = independent.ownsConnection;

  try {
    await tx.query('BEGIN');

    const tenantId = extractTenantId(event);
    const insert = await recordWebhookEvent(
      tx,
      'stripe',
      event.id,
      event.type,
      tenantId,
      event,
      'verified',
    );

    if (!insert.wasInserted) {
      await tx.query('COMMIT');
      return { kind: 'deduped', dispatch: dispatchKind, deduped: true };
    }

    if (dispatchKind === 'ignored') {
      await markWebhookProcessed(tx, insert.id);
      await tx.query('COMMIT');
      return { kind: 'ignored', dispatch: dispatchKind };
    }

    await dispatchSideEffects(tx, dispatchKind, event);

    await markWebhookProcessed(tx, insert.id);
    await tx.query('COMMIT');
    return { kind: 'processed', dispatch: dispatchKind };
  } catch (error) {
    try {
      await tx.query('ROLLBACK');
    } catch {
      // tx já estava fechado; ignoramos.
    }

    await tryMarkFailedBestEffort(pool, event.id, errorMessage(error));
    throw error;
  } finally {
    if (ownsConnection) {
      tx.release();
    }
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

async function ensureClient(
  pool: Pool | PoolClient,
): Promise<{ client: PoolClient; ownsConnection: boolean }> {
  if ('release' in pool && typeof (pool as PoolClient).query === 'function') {
    const candidate = pool as PoolClient;
    if (typeof candidate.release === 'function') {
      return { client: candidate, ownsConnection: false };
    }
  }
  const client = await (pool as Pool).connect();
  return { client, ownsConnection: true };
}

function extractTenantId(event: StripeWebhookEvent): string | null {
  const data = event.data?.object as Record<string, unknown> | undefined;
  if (!data) return null;
  const metadata = (data['metadata'] ?? {}) as Record<string, unknown>;
  const fromMetadata = metadata['tenant_id'];
  if (typeof fromMetadata === 'string' && fromMetadata.length > 0) {
    return fromMetadata;
  }
  if (
    typeof data['client_reference_id'] === 'string' &&
    (data['client_reference_id'] as string).length > 0
  ) {
    return data['client_reference_id'] as string;
  }
  return null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 2000);
  return String(error).slice(0, 2000);
}

async function tryMarkFailedBestEffort(
  pool: Pool | PoolClient,
  eventId: string,
  message: string,
): Promise<void> {
  try {
    const existing = await findRowId(pool, eventId);
    if (!existing) return;
    await markWebhookFailed(pool, existing, message);
  } catch {
    // best-effort — não propaga.
  }
}

async function findRowId(
  pool: Pool | PoolClient,
  eventId: string,
): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM webhook_events WHERE provider = 'stripe' AND event_id = $1`,
    [eventId],
  );
  return result.rows[0]?.id ?? null;
}

async function dispatchSideEffects(
  client: PoolClient,
  dispatchKind: Exclude<DispatchKind, 'ignored'>,
  event: StripeWebhookEvent,
): Promise<void> {
  switch (dispatchKind) {
    case 'subscription.created':
      await applySubscriptionCreatedOrUpdated(client, event, 'active');
      return;
    case 'subscription.updated':
      await applySubscriptionCreatedOrUpdated(client, event, null);
      return;
    case 'subscription.deleted':
      await applySubscriptionDeleted(client, event);
      return;
    case 'checkout.session.completed':
      await applyCheckoutCompleted(client, event);
      return;
    case 'invoice.payment_failed':
      await applyInvoicePaymentFailed(client, event);
      return;
    case 'invoice.paid':
      await applyInvoicePaid(client, event);
      return;
    default: {
      const _exhaustive: never = dispatchKind;
      return _exhaustive;
    }
  }
}

// ─── subscription lifecycle ────────────────────────────────────────────────

interface StripeSubscriptionShape {
  id?: string;
  customer?: string;
  status?: string;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ price?: { id?: string } | string }> };
  current_period_start?: number;
  current_period_end?: number;
  trial_end?: number | null;
  cancel_at?: number | null;
  canceled_at?: number | null;
}

interface StripeCheckoutShape {
  id?: string;
  customer?: string;
  client_reference_id?: string;
  metadata?: Record<string, string>;
  subscription?: string | null;
  trial_end?: number | null;
  payment_status?: string;
  status?: string;
}

function asSubscription(data: unknown): StripeSubscriptionShape {
  return (data ?? {}) as StripeSubscriptionShape;
}

function asCheckout(data: unknown): StripeCheckoutShape {
  return (data ?? {}) as StripeCheckoutShape;
}

function mapStripeSubscriptionStatusToTenant(
  status: string | undefined,
): 'active' | 'trialing' | 'past_due' | 'canceled' | null {
  switch (status) {
    case 'active':
      return 'active';
    case 'trialing':
      return 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled';
    default:
      return null;
  }
}

async function applySubscriptionCreatedOrUpdated(
  client: PoolClient,
  event: StripeWebhookEvent,
  forcedTenantStatus: 'active' | null,
): Promise<void> {
  const sub = asSubscription(event.data?.object);
  const tenantId = firstTenantId(sub.metadata);
  if (!tenantId) {
    // Sem tenantId não há transições de estado para fazer. Audit log
    // é gravado para investigação.
    await recordAuditLog(client, {
      tenantId: null,
      actorUserId: null,
      action: 'stripe.webhook.subscription.missing_tenant',
      entityType: 'subscription',
      entityId: sub.id ?? null,
      payload: { eventId: event.id, eventType: event.type },
    });
    return;
  }

  const externalId = sub.id ?? null;
  const externalCustomerId =
    typeof sub.customer === 'string' ? sub.customer : null;
  const priceId = readPriceId(sub);
  const planCode = sub.metadata?.['plan_code'] ?? 'pro-monthly';

  if (externalId && externalCustomerId && priceId) {
    const periodStart = secondsToDate(sub.current_period_start);
    const periodEnd = secondsToDate(sub.current_period_end);
    if (periodStart && periodEnd) {
      // Cast: plan_code vem da metadata da Stripe; o CHECK em DB
      // vai rejeitar valores fora do closed-set.
      await client.query(
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
           updated_at = NOW()`,
        [
          tenantId,
          planCode,
          priceId,
          externalId,
          externalCustomerId,
          mapStripeSubscriptionStatusToTenant(sub.status) ?? 'active',
          periodStart,
          periodEnd,
          secondsToDateOrNull(sub.trial_end),
          secondsToDateOrNull(sub.cancel_at),
          secondsToDateOrNull(sub.canceled_at),
        ],
      );
    }
  }

  const targetStatus =
    forcedTenantStatus ?? mapStripeSubscriptionStatusToTenant(sub.status);
  if (targetStatus) {
    await safeUpdateTenantStatus(client, tenantId, targetStatus);
  }

  await recordAuditLog(client, {
    tenantId,
    actorUserId: null,
    action: `stripe.${event.type}`,
    entityType: 'subscription',
    entityId: externalId,
    payload: {
      status: sub.status,
      eventId: event.id,
    },
  });
}

async function applySubscriptionDeleted(
  client: PoolClient,
  event: StripeWebhookEvent,
): Promise<void> {
  const sub = asSubscription(event.data?.object);
  const tenantId = firstTenantId(sub.metadata);
  if (!tenantId) {
    await recordAuditLog(client, {
      tenantId: null,
      actorUserId: null,
      action: 'stripe.webhook.subscription.deleted.missing_tenant',
      entityType: 'subscription',
      entityId: sub.id ?? null,
      payload: { eventId: event.id },
    });
    return;
  }

  if (sub.id) {
    await client.query(
      `UPDATE subscriptions
          SET status = 'canceled',
              canceled_at = NOW(),
              updated_at = NOW()
        WHERE external_id = $1`,
      [sub.id],
    );
  }

  await safeUpdateTenantStatus(client, tenantId, 'canceled');

  await recordAuditLog(client, {
    tenantId,
    actorUserId: null,
    action: 'stripe.customer.subscription.deleted',
    entityType: 'subscription',
    entityId: sub.id ?? null,
    payload: { eventId: event.id },
  });
}

async function applyCheckoutCompleted(
  client: PoolClient,
  event: StripeWebhookEvent,
): Promise<void> {
  const checkout = asCheckout(event.data?.object);
  const tenantId =
    firstTenantId(checkout.metadata) ?? checkout.client_reference_id ?? null;
  if (!tenantId) {
    await recordAuditLog(client, {
      tenantId: null,
      actorUserId: null,
      action: 'stripe.checkout.session.completed.missing_tenant',
      entityType: 'checkout_session',
      entityId: checkout.id ?? null,
      payload: { eventId: event.id },
    });
    return;
  }

  const targetStatus = checkout.trial_end ? 'trialing' : 'active';
  await safeUpdateTenantStatus(client, tenantId, targetStatus);

  await recordAuditLog(client, {
    tenantId,
    actorUserId: null,
    action: 'stripe.checkout.session.completed',
    entityType: 'checkout_session',
    entityId: checkout.id ?? null,
    payload: {
      payment_status: checkout.payment_status,
      status: checkout.status,
      trial_end: checkout.trial_end,
      eventId: event.id,
    },
  });
}

async function applyInvoicePaymentFailed(
  client: PoolClient,
  event: StripeWebhookEvent,
): Promise<void> {
  const data = asSubscription(event.data?.object);
  const tenantId = firstTenantId(data.metadata);
  if (!tenantId) {
    await recordAuditLog(client, {
      tenantId: null,
      actorUserId: null,
      action: 'stripe.invoice.payment_failed.missing_tenant',
      entityType: 'invoice',
      entityId: null,
      payload: { eventId: event.id },
    });
    return;
  }

  await safeUpdateTenantStatus(client, tenantId, 'past_due');

  await recordAuditLog(client, {
    tenantId,
    actorUserId: null,
    action: 'stripe.invoice.payment_failed',
    entityType: 'invoice',
    entityId: null,
    payload: { eventId: event.id },
  });
}

async function applyInvoicePaid(
  client: PoolClient,
  event: StripeWebhookEvent,
): Promise<void> {
  const data = asSubscription(event.data?.object);
  const tenantId = firstTenantId(data.metadata);
  if (!tenantId) {
    await recordAuditLog(client, {
      tenantId: null,
      actorUserId: null,
      action: 'stripe.invoice.paid.missing_tenant',
      entityType: 'invoice',
      entityId: null,
      payload: { eventId: event.id },
    });
    return;
  }

  // Só transita past_due → active. Não toca em suspended/canceled.
  await client.query(
    `UPDATE tenants
        SET status = 'active',
            updated_at = NOW()
      WHERE id = $1
        AND status = 'past_due'`,
    [tenantId],
  );

  await recordAuditLog(client, {
    tenantId,
    actorUserId: null,
    action: 'stripe.invoice.paid',
    entityType: 'invoice',
    entityId: null,
    payload: { eventId: event.id },
  });
}

// ─── shared helpers ────────────────────────────────────────────────────────

async function safeUpdateTenantStatus(
  client: PoolClient,
  tenantId: string,
  status: 'active' | 'trialing' | 'past_due' | 'canceled',
): Promise<void> {
  await client.query(
    `UPDATE tenants
        SET status = $2,
            updated_at = NOW()
      WHERE id = $1
        AND status NOT IN ('suspended', 'canceled')`,
    [tenantId, status],
  );
}

function firstTenantId(
  metadata: Record<string, string> | undefined,
): string | null {
  if (!metadata) return null;
  const value = metadata['tenant_id'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readPriceId(sub: StripeSubscriptionShape): string | null {
  const item = sub.items?.data?.[0];
  if (!item) return null;
  if (typeof item.price === 'string') return item.price;
  return item.price?.id ?? null;
}

function secondsToDate(value: number | undefined): Date | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value * 1000);
}

function secondsToDateOrNull(value: number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  return secondsToDate(value);
}

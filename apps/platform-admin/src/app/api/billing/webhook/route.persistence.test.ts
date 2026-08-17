/**
 * Testes de integração: persistência idempotente de webhooks contra Postgres
 * real. Estes testes só correm quando `TEST_DATABASE_URL` está definido
 * (CI / VM descartável). Em produção/preview sem DB configurado ficam em
 * `skipped` via `it.runIf`, de modo a manter o feedback loop rápido.
 *
 * Ficheiro separado do `route.test.ts` para evitar que o `vi.mock` hoisted
 * global (que mocka `@/lib/database/postgres` e `@/lib/billing/process-stripe-event`)
 * substitua a implementação real que estes testes invocam.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type ProcessResult =
  | { kind: 'processed'; dispatch: string }
  | { kind: 'ignored'; dispatch: string }
  | { kind: 'deduped'; dispatch: string; deduped: true };

type SubscriptionEvent = Parameters<
  typeof import('@/lib/billing/process-stripe-event').processStripeWebhook
>[1];

describe('processStripeWebhook (persistência idempotente)', () => {
  const connectionString =
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

  beforeAll(() => {
    if (!connectionString) return;
    process.env.DATABASE_URL = connectionString;
  });

  afterAll(() => {
    if (!connectionString) return;
    delete process.env.DATABASE_URL;
  });

  it.runIf(Boolean(connectionString))(
    'subscription.created persiste, activa o tenant e é idempotente na 2ª chamada',
    async () => {
      const { runMigrations } = await import('@beauty-saas/database');
      const { processStripeWebhook } =
        await import('@/lib/billing/process-stripe-event');
      const { Pool } = await import('pg');

      const pool = new Pool({ connectionString: connectionString! });
      try {
        await runMigrations(pool);
        await pool.query(
          'TRUNCATE subscriptions, webhook_events, audit_logs, tenant_users, tenants CASCADE',
        );
        // Cria tenant de teste com slug único para evitar conflito com outros testes.
        const tenantId = await seedTrialingTenant(
          pool,
          `salao-${Math.random().toString(36).slice(2, 8)}`,
        );

        const eventId = `evt_persist_${Date.now()}`;
        const stripeEvent = buildSubscriptionEvent(
          eventId,
          tenantId,
          'sub_stripe_001',
        );

        const primeiraVez = (await processStripeWebhook(
          pool,
          stripeEvent,
          'subscription.created',
        )) as ProcessResult;
        const segundaVez = (await processStripeWebhook(
          pool,
          stripeEvent,
          'subscription.created',
        )) as ProcessResult;

        expect(primeiraVez).toEqual({
          kind: 'processed',
          dispatch: 'subscription.created',
        });
        expect(segundaVez).toEqual({
          kind: 'deduped',
          dispatch: 'subscription.created',
          deduped: true,
        });

        const tenantRow = await pool.query<{ status: string }>(
          'SELECT status FROM tenants WHERE id = $1',
          [tenantId],
        );
        expect(tenantRow.rows[0]?.status).toBe('active');

        const subs = await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM subscriptions WHERE tenant_id = $1',
          [tenantId],
        );
        expect(subs.rows[0]?.count).toBe('1');

        const audit = await pool.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM audit_logs WHERE tenant_id = $1',
          [tenantId],
        );
        expect(audit.rows[0]?.count).toBe('1');

        const events = await pool.query<{ count: string }>(
          "SELECT count(*)::text AS count FROM webhook_events WHERE provider = 'stripe' AND event_id = $1",
          [eventId],
        );
        expect(events.rows[0]?.count).toBe('1');
      } finally {
        await pool.end();
      }
    },
  );

  it.runIf(Boolean(connectionString))(
    "checkout.session.completed transita o tenant para 'trialing'",
    async () => {
      const { runMigrations } = await import('@beauty-saas/database');
      const { processStripeWebhook } =
        await import('@/lib/billing/process-stripe-event');
      const { Pool } = await import('pg');

      const pool = new Pool({ connectionString: connectionString! });
      try {
        await runMigrations(pool);
        await pool.query(
          'TRUNCATE subscriptions, webhook_events, audit_logs, tenant_users, tenants CASCADE',
        );
        const tenantId = await seedTrialingTenant(
          pool,
          `salao-${Math.random().toString(36).slice(2, 8)}`,
        );

        const eventId = `evt_checkout_${Date.now()}`;
        const stripeEvent = buildCheckoutCompletedEvent(eventId, tenantId);

        const resultado = (await processStripeWebhook(
          pool,
          stripeEvent,
          'checkout.session.completed',
        )) as ProcessResult;

        expect(resultado).toEqual({
          kind: 'processed',
          dispatch: 'checkout.session.completed',
        });

        const tenantRow = await pool.query<{ status: string }>(
          'SELECT status FROM tenants WHERE id = $1',
          [tenantId],
        );
        expect(tenantRow.rows[0]?.status).toBe('trialing');
      } finally {
        await pool.end();
      }
    },
  );
});

async function seedTrialingTenant(
  pool: import('pg').Pool,
  slug: string,
): Promise<string> {
  const { createTenantWithOwner } = await import('@beauty-saas/database');
  const created = await createTenantWithOwner(pool, {
    slug,
    name: `Salão ${slug}`,
    ownerEmail: `owner-${slug}@example.pt`,
    ownerName: `Owner ${slug}`,
    passwordHash: 'argon2id$hash-test',
    trialEndsAt: null,
  });
  return created.tenant.id;
}

function buildSubscriptionEvent(
  eventId: string,
  tenantId: string,
  subscriptionId: string,
): SubscriptionEvent {
  const stripeEvent = {
    id: eventId,
    object: 'event' as const,
    type: 'customer.subscription.created',
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: subscriptionId,
        object: 'subscription',
        customer: 'cus_test_001',
        status: 'active',
        metadata: {
          tenant_id: tenantId,
          plan_code: 'pro-monthly',
        },
        items: {
          data: [
            {
              price: { id: 'price_pro_monthly' },
            },
          ],
        },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 2592000,
        trial_end: null,
        cancel_at: null,
        canceled_at: null,
      },
      previous_attributes: null,
    },
    request: null,
  };
  return stripeEvent as unknown as SubscriptionEvent;
}

function buildCheckoutCompletedEvent(
  eventId: string,
  tenantId: string,
): SubscriptionEvent {
  const stripeEvent = {
    id: eventId,
    object: 'event' as const,
    type: 'checkout.session.completed',
    api_version: null,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    data: {
      object: {
        id: 'cs_test_001',
        object: 'checkout.session',
        customer: 'cus_test_001',
        client_reference_id: tenantId,
        metadata: {
          tenant_id: tenantId,
          plan_code: 'pro-monthly',
        },
        subscription: null,
        mode: 'subscription',
        payment_status: 'paid',
        status: 'complete',
        trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      },
      previous_attributes: null,
    },
    request: null,
  };
  return stripeEvent as unknown as SubscriptionEvent;
}

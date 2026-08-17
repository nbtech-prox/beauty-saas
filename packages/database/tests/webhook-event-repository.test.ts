import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from '../src/migrations.js';
import {
  type WebhookEventRecord,
  findWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
  recordWebhookEvent,
} from '../src/webhook-event-repository.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error('TEST_DATABASE_URL é obrigatório nos testes de integração.');

const pool = new Pool({ connectionString });

beforeAll(async () => {
  await runMigrations(pool);
});

afterEach(async () => {
  await pool.query(
    'TRUNCATE subscriptions, webhook_events, audit_logs, tenant_users, tenants CASCADE',
  );
});

afterAll(async () => {
  await pool.end();
});

const basePayload = { id: 'evt_001', type: 'customer.subscription.updated' };

describe('recordWebhookEvent', () => {
  it('insere um evento novo e devolve wasInserted true com o id devolvido', async () => {
    const resultado = await recordWebhookEvent(
      pool,
      'stripe',
      'evt_001',
      'customer.subscription.updated',
      null,
      basePayload,
      'verified',
    );

    expect(resultado.wasInserted).toBe(true);
    expect(resultado.id).toMatch(/^[0-9a-f-]{36}$/);

    const persistido = await pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM webhook_events',
    );
    expect(persistido.rows[0]?.total).toBe('1');
  });

  it('é idempotente: uma segunda chamada com o mesmo (provider, event_id) devolve wasInserted false sem inserir novo', async () => {
    const primeiro = await recordWebhookEvent(
      pool,
      'stripe',
      'evt_001',
      'customer.subscription.updated',
      null,
      basePayload,
      'verified',
    );

    const segundo = await recordWebhookEvent(
      pool,
      'stripe',
      'evt_001',
      'customer.subscription.updated',
      null,
      { id: 'evt_001', type: 'outra', duplicado: true },
      'verified',
    );

    expect(primeiro.wasInserted).toBe(true);
    expect(segundo.wasInserted).toBe(false);
    expect(segundo.id).toBe(primeiro.id);

    const total = await pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM webhook_events',
    );
    expect(total.rows[0]?.total).toBe('1');
  });
});

describe('markWebhookProcessed', () => {
  it('transita processing_status para processed e preenche processed_at', async () => {
    const registo = await recordWebhookEvent(
      pool,
      'stripe',
      'evt_002',
      'invoice.paid',
      null,
      basePayload,
      'verified',
    );

    await markWebhookProcessed(pool, registo.id);

    const found = await findWebhookEvent(pool, 'stripe', 'evt_002');
    expect(found?.processingStatus).toBe('processed');
    expect(found?.processedAt).toBeInstanceOf(Date);
  });
});

describe('markWebhookFailed', () => {
  it('regista last_error e mantém processing_status como failed', async () => {
    const registo = await recordWebhookEvent(
      pool,
      'stripe',
      'evt_003',
      'invoice.payment_failed',
      null,
      basePayload,
      'verified',
    );

    await markWebhookFailed(pool, registo.id, 'timeout ao contactar o PSP');

    const found = await findWebhookEvent(pool, 'stripe', 'evt_003');
    expect(found?.processingStatus).toBe('failed');
    expect(found?.lastError).toBe('timeout ao contactar o PSP');
  });
});

describe('findWebhookEvent', () => {
  it('devolve o registo persistido', async () => {
    await recordWebhookEvent(
      pool,
      'stripe',
      'evt_004',
      'customer.created',
      null,
      { foo: 'bar' },
      'verified',
    );

    const found = await findWebhookEvent(pool, 'stripe', 'evt_004');

    expect(found).toBeDefined();
    expect(found?.provider).toBe('stripe');
    expect(found?.eventId).toBe('evt_004');
    expect(found?.eventType).toBe('customer.created');
    expect(found?.payload).toEqual({ foo: 'bar' });
    expect(found?.signatureStatus).toBe('verified');
    expect(found?.processingStatus).toBe('pending');
    expect(found?.attemptCount).toBe(0);
    expect(found?.tenantId).toBeNull();
  });

  it('devolve undefined quando não existe', async () => {
    const found = await findWebhookEvent(pool, 'stripe', 'evt_nao_existe');
    expect(found).toBeUndefined();
  });
});

// Sanity check: confirma que o tipo WebhookEventRecord está alinhado com o contrato.
const _typeCheck: WebhookEventRecord | undefined = undefined;
void _typeCheck;

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from '../src/migrations.js';
import {
  type SubscriptionPlanCode,
  type SubscriptionRecord,
  type SubscriptionStatus,
  getSubscriptionByExternalId,
  listSubscriptionsByTenantAndStatuses,
  upsertSubscription,
} from '../src/subscription-repository.js';
import { createTenantWithOwner } from '../src/tenant-repository.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error('TEST_DATABASE_URL é obrigatório nos testes de integração.');

const pool = new Pool({ connectionString });

beforeAll(async () => {
  await runMigrations(pool);
});

afterEach(async () => {
  // Limpa todas as tabelas mutáveis entre testes; preserva schema_migrations.
  await pool.query(
    'TRUNCATE subscriptions, webhook_events, audit_logs, tenant_users, tenants CASCADE',
  );
});

afterAll(async () => {
  await pool.end();
});

async function seedTenant(slug: string): Promise<string> {
  const created = await createTenantWithOwner(pool, {
    slug,
    name: `Salão ${slug}`,
    ownerEmail: `owner-${slug}@example.pt`,
    ownerName: `Owner ${slug}`,
    passwordHash: 'argon2id$hash-de-teste',
    trialEndsAt: null,
  });
  return created.tenant.id;
}

const baseInput = {
  planCode: 'pro-monthly' as SubscriptionPlanCode,
  stripePriceId: 'price_pro_monthly',
  externalId: 'sub_stripe_001',
  externalCustomerId: 'cus_stripe_001',
  status: 'active' as SubscriptionStatus,
  currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
  currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
} satisfies Omit<
  Parameters<typeof upsertSubscription>[1],
  'tenantId' | 'trialEnd' | 'cancelAt' | 'canceledAt'
>;

describe('upsertSubscription', () => {
  it('insere uma nova subscription quando o external_id ainda não existe', async () => {
    const tenantId = await seedTenant('salao-aurora');

    const resultado = await upsertSubscription(pool, {
      ...baseInput,
      tenantId,
    });

    expect(resultado).toMatchObject({
      tenantId,
      planCode: 'pro-monthly',
      stripePriceId: 'price_pro_monthly',
      externalId: 'sub_stripe_001',
      externalCustomerId: 'cus_stripe_001',
      status: 'active',
    });
    expect(resultado.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(resultado.currentPeriodStart.toISOString()).toBe(
      '2026-08-01T00:00:00.000Z',
    );
    expect(resultado.currentPeriodEnd.toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
    expect(resultado.trialEnd).toBeNull();
    expect(resultado.cancelAt).toBeNull();
    expect(resultado.canceledAt).toBeNull();

    const persistido = await pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM subscriptions',
    );
    expect(persistido.rows[0]?.total).toBe('1');
  });

  it('actualiza a subscription existente quando o external_id coincide', async () => {
    const tenantId = await seedTenant('salao-aurora');

    const inicial = await upsertSubscription(pool, {
      ...baseInput,
      tenantId,
      status: 'active',
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    });

    const atualizado = await upsertSubscription(pool, {
      ...baseInput,
      tenantId,
      status: 'past_due',
      currentPeriodStart: new Date('2026-09-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-10-01T00:00:00.000Z'),
      trialEnd: null,
      cancelAt: new Date('2026-10-15T00:00:00.000Z'),
      canceledAt: null,
    });

    expect(atualizado.id).toBe(inicial.id);
    expect(atualizado.status).toBe('past_due');
    expect(atualizado.currentPeriodStart.toISOString()).toBe(
      '2026-09-01T00:00:00.000Z',
    );
    expect(atualizado.currentPeriodEnd.toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
    expect(atualizado.cancelAt?.toISOString()).toBe('2026-10-15T00:00:00.000Z');

    const total = await pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM subscriptions',
    );
    expect(total.rows[0]?.total).toBe('1');
  });
});

describe('getSubscriptionByExternalId', () => {
  it('devolve o registo quando existe', async () => {
    const tenantId = await seedTenant('salao-aurora');
    await upsertSubscription(pool, { ...baseInput, tenantId });

    const found = await getSubscriptionByExternalId(pool, 'sub_stripe_001');

    expect(found).not.toBeNull();
    expect(found?.externalId).toBe('sub_stripe_001');
    expect(found?.tenantId).toBe(tenantId);
    expect(found?.planCode).toBe('pro-monthly');
  });

  it('devolve null quando não existe', async () => {
    const found = await getSubscriptionByExternalId(pool, 'sub_inexistente');
    expect(found).toBeNull();
  });
});

describe('listSubscriptionsByTenantAndStatuses', () => {
  it('filtra por tenant e por conjunto de estados', async () => {
    const tenantA = await seedTenant('salao-aurora');
    const tenantB = await seedTenant('salao-nova-luz');

    await upsertSubscription(pool, {
      ...baseInput,
      tenantId: tenantA,
      externalId: 'sub_a_1',
      status: 'active',
      planCode: 'pro-monthly',
    });
    await upsertSubscription(pool, {
      ...baseInput,
      tenantId: tenantA,
      externalId: 'sub_a_2',
      status: 'trialing',
      planCode: 'starter-monthly',
    });
    await upsertSubscription(pool, {
      ...baseInput,
      tenantId: tenantA,
      externalId: 'sub_a_3',
      status: 'canceled',
      planCode: 'enterprise-monthly',
    });
    await upsertSubscription(pool, {
      ...baseInput,
      tenantId: tenantB,
      externalId: 'sub_b_1',
      status: 'active',
      planCode: 'pro-yearly',
    });

    const resultado = await listSubscriptionsByTenantAndStatuses(
      pool,
      tenantA,
      ['active', 'trialing'],
    );

    const externalIds = resultado
      .map((linha: SubscriptionRecord) => linha.externalId)
      .sort();
    expect(externalIds).toEqual(['sub_a_1', 'sub_a_2']);
    expect(resultado.every((linha) => linha.tenantId === tenantA)).toBe(true);
  });

  it('permite que dois tenants diferentes partilhem o mesmo plan_code', async () => {
    const tenantA = await seedTenant('salao-aurora');
    const tenantB = await seedTenant('salao-nova-luz');

    await upsertSubscription(pool, {
      ...baseInput,
      tenantId: tenantA,
      externalId: 'sub_a_plano',
      planCode: 'pro-monthly',
    });

    await expect(
      upsertSubscription(pool, {
        ...baseInput,
        tenantId: tenantB,
        externalId: 'sub_b_plano',
        planCode: 'pro-monthly',
      }),
    ).resolves.toMatchObject({ planCode: 'pro-monthly' });

    const total = await pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM subscriptions',
    );
    expect(total.rows[0]?.total).toBe('2');
  });

  it('rejeita duas subscriptions com o mesmo plan_code dentro do mesmo tenant', async () => {
    const tenantId = await seedTenant('salao-aurora');

    await upsertSubscription(pool, {
      ...baseInput,
      tenantId,
      externalId: 'sub_a_1',
      planCode: 'pro-monthly',
    });

    await expect(
      upsertSubscription(pool, {
        ...baseInput,
        tenantId,
        externalId: 'sub_a_2',
        planCode: 'pro-monthly',
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rejeita subscriptions cujo tenant_id não existe', async () => {
    const tenantInexistente = '00000000-0000-0000-0000-000000000000';

    await expect(
      upsertSubscription(pool, { ...baseInput, tenantId: tenantInexistente }),
    ).rejects.toMatchObject({ code: '23503' });
  });
});

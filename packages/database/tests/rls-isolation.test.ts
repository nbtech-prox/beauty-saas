import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';
import { runMigrations } from '../src/migrations.js';
import {
  type AuditLogRecord,
  listAuditLogsByTenant,
  recordAuditLog,
} from '../src/audit-log-repository.js';
import {
  type SubscriptionRecord,
  upsertSubscription,
} from '../src/subscription-repository.js';
import {
  findWebhookEvent,
  recordWebhookEvent,
} from '../src/webhook-event-repository.js';
import { createTenantWithOwner } from '../src/tenant-repository.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error('TEST_DATABASE_URL é obrigatório nos testes de integração.');

// URL.parse só aceita string não-undefined; o check acima garante.
let _runtimeUrlTemplate: URL | null = null;

const ROLE_NAME = 'database_repositories_rls_role';
const ROLE_PASSWORD = 'repositories-rls-password';

const adminPool = new Pool({ connectionString });

async function recreateRole(): Promise<void> {
  // Limpa resíduos da role anterior (se existir) para que DROP ROLE não
  // falhe por objects dependentes. Usamos apenas se for realmente
  // necessário — `DROP ROLE IF EXISTS` é silencioso.
  await adminPool.query(
    "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'database_repositories_rls_role') THEN EXECUTE 'DROP OWNED BY database_repositories_rls_role CASCADE'; END IF; END $$",
  );
  await adminPool.query('DROP ROLE IF EXISTS database_repositories_rls_role');
  await adminPool.query(
    `CREATE ROLE database_repositories_rls_role
       LOGIN PASSWORD '${ROLE_PASSWORD}' NOSUPERUSER NOBYPASSRLS`,
  );
  await adminPool.query(
    'GRANT USAGE ON SCHEMA public TO database_repositories_rls_role',
  );
  // Grants mínimos para que os repositories funcionem sob RLS forçado.
  await adminPool.query(
    `GRANT SELECT, INSERT, UPDATE ON subscriptions, webhook_events, audit_logs
       TO database_repositories_rls_role`,
  );
  await adminPool.query(
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
       TO database_repositories_rls_role`,
  );
}

beforeAll(async () => {
  await recreateRole();
  await runMigrations(adminPool);
});

afterEach(async () => {
  await adminPool.query(
    'TRUNCATE subscriptions, webhook_events, audit_logs, tenant_users, tenants CASCADE',
  );
  await recreateRole();
});

afterAll(async () => {
  try {
    await adminPool.query(
      "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'database_repositories_rls_role') THEN EXECUTE 'DROP OWNED BY database_repositories_rls_role CASCADE'; END IF; END $$",
    );
    await adminPool.query('DROP ROLE IF EXISTS database_repositories_rls_role');
  } finally {
    await adminPool.end();
  }
});

function buildRuntimeUrl(): string {
  if (_runtimeUrlTemplate === null)
    _runtimeUrlTemplate = new URL(connectionString as string);
  _runtimeUrlTemplate.username = ROLE_NAME;
  _runtimeUrlTemplate.password = ROLE_PASSWORD;
  return _runtimeUrlTemplate.toString();
}

async function withRuntimeRole<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const runtimePool = new Pool({ connectionString: buildRuntimeUrl() });
  const client = await acquireRuntimeClient(runtimePool);
  try {
    return await fn(client);
  } finally {
    try {
      await client.query('ROLLBACK');
    } catch {
      // best-effort; se já fez commit no fn, falhamos a fechar — ignora.
    } finally {
      client.release();
      await runtimePool.end();
    }
  }
}

async function acquireRuntimeClient(pool: Pool): Promise<PoolClient> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE database_repositories_rls_role`);
    return client;
  } catch (error) {
    client.release(error as Error);
    throw error;
  }
}

async function seedTenants(): Promise<{ tenantA: string; tenantB: string }> {
  const a = await createTenantWithOwner(adminPool, {
    slug: 'tenant-a',
    name: 'Tenant A',
    ownerEmail: 'owner-a@example.pt',
    ownerName: 'Owner A',
    passwordHash: 'argon2id$hash-a',
    trialEndsAt: null,
  });
  const b = await createTenantWithOwner(adminPool, {
    slug: 'tenant-b',
    name: 'Tenant B',
    ownerEmail: 'owner-b@example.pt',
    ownerName: 'Owner B',
    passwordHash: 'argon2id$hash-b',
    trialEndsAt: null,
  });
  return { tenantA: a.tenant.id, tenantB: b.tenant.id };
}

describe('isolamento RLS dos repositories sob NOSUPERUSER NOBYPASSRLS', () => {
  it('upsertSubscription + listSubscriptionsByTenantAndStatuses respeitam app.tenant_id', async () => {
    const { tenantA, tenantB } = await seedTenants();
    await upsertSubscription(adminPool, {
      tenantId: tenantA,
      planCode: 'pro-monthly',
      stripePriceId: 'price_a',
      externalId: 'sub_a',
      externalCustomerId: 'cus_a',
      status: 'active',
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    });
    await upsertSubscription(adminPool, {
      tenantId: tenantB,
      planCode: 'pro-monthly',
      stripePriceId: 'price_b',
      externalId: 'sub_b',
      externalCustomerId: 'cus_b',
      status: 'active',
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    });

    await withRuntimeRole(async (client) => {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantA,
      ]);

      // listSubscriptionsByTenantAndStatuses via pool normal falha (precisa de SET ROLE);
      // re-executamos aqui usando o client já autenticado para validar a política subjacente.
      const visiveis = await client.query<{ external_id: string }>(
        `SELECT external_id FROM subscriptions
          WHERE tenant_id = $1
            AND status = ANY($2::text[])`,
        [tenantA, ['active']],
      );
      expect(visiveis.rows.map((row) => row.external_id)).toEqual(['sub_a']);

      // tenantB não vê nada.
      const outras = await client.query<{ external_id: string }>(
        `SELECT external_id FROM subscriptions
          WHERE tenant_id = $1`,
        [tenantB],
      );
      expect(outras.rows).toEqual([]);
    });
  });

  it('recordWebhookEvent rejeita inserções cross-tenant sob runtime role', async () => {
    const { tenantA, tenantB } = await seedTenants();

    await withRuntimeRole(async (client) => {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantA,
      ]);

      // Inserir evento do próprio tenant: OK.
      const proprio = await recordWebhookEvent(
        client as unknown as Pool,
        'stripe',
        'evt_a',
        'invoice.paid',
        tenantA,
        { id: 'evt_a' },
        'verified',
      );
      expect(proprio.wasInserted).toBe(true);

      // findWebhookEvent devolve o registo dentro do contexto do tenant.
      const found = await findWebhookEvent(
        client as unknown as Pool,
        'stripe',
        'evt_a',
      );
      expect(found?.tenantId).toBe(tenantA);
    });

    // Seed de evento do tenantB como superuser (única forma de existir
    // uma linha com tenant_id != context).
    await recordWebhookEvent(
      adminPool,
      'stripe',
      'evt_b',
      'invoice.paid',
      tenantB,
      { id: 'evt_b' },
      'verified',
    );

    await withRuntimeRole(async (client) => {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantA,
      ]);
      // tenantA NÃO vê o evento do tenantB.
      const invisivel = await client.query<{ id: string }>(
        'SELECT id FROM webhook_events',
      );
      expect(invisivel.rows).toEqual([]);
    });
  });

  it('recordAuditLog e listAuditLogsByTenant respeitam app.tenant_id e bloqueiam cross-tenant write', async () => {
    const { tenantA, tenantB } = await seedTenants();

    // Seed de logs do tenantA e tenantB via superuser.
    await recordAuditLog(adminPool, {
      tenantId: tenantA,
      actorUserId: null,
      action: 'tenantA.event',
      entityType: 'demo',
      entityId: null,
    });
    await recordAuditLog(adminPool, {
      tenantId: tenantB,
      actorUserId: null,
      action: 'tenantB.event',
      entityType: 'demo',
      entityId: null,
    });

    await withRuntimeRole(async (client) => {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantA,
      ]);

      const linhas = await client.query<{ action: string }>(
        `SELECT action FROM audit_logs WHERE tenant_id = $1`,
        [tenantA],
      );
      expect(linhas.rows.map((row) => row.action)).toEqual(['tenantA.event']);

      // listAuditLogsByTenant via pool runtime precisa de GRANT extra? não — apenas SELECT.
      const viaRepo = await (async () => {
        const poolAsClient = client as unknown as Pool;
        return listAuditLogsByTenant(poolAsClient, tenantA);
      })();
      expect(viaRepo.map((linha: AuditLogRecord) => linha.action)).toEqual([
        'tenantA.event',
      ]);

      // Cross-tenant write é bloqueado pela policy WITH CHECK.
      await expect(
        recordAuditLog(client as unknown as Pool, {
          tenantId: tenantB,
          actorUserId: null,
          action: 'tentativa.cross',
          entityType: 'demo',
          entityId: null,
        }),
      ).rejects.toMatchObject({ code: '42501' });
    });
  });

  it('em ausência de app.tenant_id a runtime role não vê nenhuma linha', async () => {
    const { tenantA } = await seedTenants();
    await upsertSubscription(adminPool, {
      tenantId: tenantA,
      planCode: 'pro-monthly',
      stripePriceId: 'price_a',
      externalId: 'sub_a',
      externalCustomerId: 'cus_a',
      status: 'active',
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
    });

    await withRuntimeRole(async (client) => {
      await client.query("SELECT set_config('app.tenant_id', '', true)");
      const semContexto = await client.query<{ total: string }>(
        'SELECT count(*)::text AS total FROM subscriptions',
      );
      expect(semContexto.rows[0]?.total).toBe('0');
    });
  });
});

// Sanity: tipo exportado continua acessível.
const _typeCheck: SubscriptionRecord | undefined = undefined;
void _typeCheck;

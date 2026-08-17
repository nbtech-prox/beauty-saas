import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from '../src/migrations.js';
import {
  type AuditLogRecord,
  listAuditLogsByTenant,
  recordAuditLog,
} from '../src/audit-log-repository.js';
import { createTenantWithOwner } from '../src/tenant-repository.js';

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

async function seedTenant(slug: string): Promise<{
  tenantId: string;
  ownerId: string;
}> {
  const created = await createTenantWithOwner(pool, {
    slug,
    name: `Salão ${slug}`,
    ownerEmail: `owner-${slug}@example.pt`,
    ownerName: `Owner ${slug}`,
    passwordHash: 'argon2id$hash-de-teste',
    trialEndsAt: null,
  });
  return { tenantId: created.tenant.id, ownerId: created.owner.id };
}

describe('recordAuditLog', () => {
  it("insere um registo sem tenant nem actor e devolve payload por omissão como '{}'", async () => {
    const registo = await recordAuditLog(pool, {
      tenantId: null,
      actorUserId: null,
      action: 'system.startup',
      entityType: 'system',
      entityId: null,
      payload: undefined,
    });

    expect(registo.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(registo.tenantId).toBeNull();
    expect(registo.actorUserId).toBeNull();
    expect(registo.action).toBe('system.startup');
    expect(registo.entityType).toBe('system');
    expect(registo.entityId).toBeNull();
    expect(registo.payload).toEqual({});
    expect(registo.occurredAt).toBeInstanceOf(Date);
  });

  it('preserva payload jsonb arbitrário', async () => {
    const { tenantId, ownerId } = await seedTenant('salao-aurora');
    const registo = await recordAuditLog(pool, {
      tenantId,
      actorUserId: ownerId,
      action: 'subscription.canceled',
      entityType: 'subscription',
      entityId: 'sub_001',
      payload: { reason: 'trial_expired', seatCount: 3 },
    });

    expect(registo.payload).toEqual({ reason: 'trial_expired', seatCount: 3 });
    expect(registo.tenantId).toBe(tenantId);
    expect(registo.actorUserId).toBe(ownerId);
  });
});

describe('listAuditLogsByTenant', () => {
  it('devolve os registos por ordem occurredAt DESC com paginação por offset/limit', async () => {
    const { tenantId } = await seedTenant('salao-aurora');

    // 5 registos espaçados no tempo.
    const baseTs = Date.parse('2026-08-01T00:00:00.000Z');
    for (let i = 0; i < 5; i += 1) {
      await pool.query(
        `INSERT INTO audit_logs (tenant_id, action, entity_type, occurred_at)
         VALUES ($1, $2, 'subscription', $3)`,
        [tenantId, `evt_${i}`, new Date(baseTs + i * 60_000)],
      );
    }

    const pagina1 = await listAuditLogsByTenant(pool, tenantId, {
      limit: 2,
      offset: 0,
    });
    const pagina2 = await listAuditLogsByTenant(pool, tenantId, {
      limit: 2,
      offset: 2,
    });
    const pagina3 = await listAuditLogsByTenant(pool, tenantId, {
      limit: 2,
      offset: 4,
    });

    expect(pagina1.map((linha: AuditLogRecord) => linha.action)).toEqual([
      'evt_4',
      'evt_3',
    ]);
    expect(pagina2.map((linha: AuditLogRecord) => linha.action)).toEqual([
      'evt_2',
      'evt_1',
    ]);
    expect(pagina3.map((linha: AuditLogRecord) => linha.action)).toEqual([
      'evt_0',
    ]);

    expect(pagina1[0]?.occurredAt.getTime()).toBeGreaterThan(
      pagina1[1]?.occurredAt.getTime() ?? 0,
    );
  });

  it('aplica defaults razoáveis quando limit/offset não são fornecidos', async () => {
    const { tenantId } = await seedTenant('salao-aurora');
    await recordAuditLog(pool, {
      tenantId,
      actorUserId: null,
      action: 'demo',
      entityType: 'demo',
      entityId: null,
    });

    const resultado = await listAuditLogsByTenant(pool, tenantId);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]?.action).toBe('demo');
  });
});

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { createTenantWithOwner, runMigrations } from '../src/index.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error('TEST_DATABASE_URL é obrigatório nos testes de integração.');

const pool = new Pool({ connectionString });

beforeAll(async () => {
  await runMigrations(pool);
});

afterEach(async () => {
  // Cada teste pressupõe uma base vazia para slugs e owners únicos;
  // limpamos tabelas de negócio (não `schema_migrations`) entre testes.
  await pool.query('TRUNCATE tenant_users, tenants CASCADE');
});

afterAll(async () => {
  await pool.end();
});

describe('createTenantWithOwner', () => {
  it('cria atomicamente o tenant trial e o utilizador owner admin', async () => {
    const resultado = await createTenantWithOwner(pool, {
      slug: 'salao-aurora',
      name: 'Salão Aurora',
      ownerEmail: 'Dona@Aurora.PT',
      ownerName: 'Dona Aurora',
      passwordHash: 'argon2id$hash-de-teste',
      trialEndsAt: new Date('2026-09-15T12:00:00.000Z'),
    });

    expect(resultado.tenant).toMatchObject({
      slug: 'salao-aurora',
      name: 'Salão Aurora',
      status: 'trialing',
      timezone: 'Europe/Lisbon',
      currency: 'EUR',
      locale: 'pt-PT',
    });
    expect(resultado.owner).toMatchObject({
      tenantId: resultado.tenant.id,
      email: 'dona@aurora.pt',
      name: 'Dona Aurora',
      role: 'admin',
      isOwner: true,
    });
    expect(resultado.owner).not.toHaveProperty('passwordHash');
    expect(resultado.tenant.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(resultado.owner.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(resultado.tenant.trialEndsAt?.toISOString()).toBe(
      '2026-09-15T12:00:00.000Z',
    );
    expect(resultado.tenant.createdAt).toBeInstanceOf(Date);
    expect(resultado.owner.createdAt).toBeInstanceOf(Date);

    const persistido = await pool.query<{ tenants: string; owners: string }>(`
      SELECT
        (SELECT count(*) FROM tenants)::text AS tenants,
        (SELECT count(*) FROM tenant_users WHERE is_owner)::text AS owners
    `);
    expect(persistido.rows[0]).toEqual({ tenants: '1', owners: '1' });
  });

  it('impede slugs repetidos sem distinguir maiúsculas de minúsculas', async () => {
    await createTenantWithOwner(pool, {
      slug: 'salao-aurora',
      name: 'Salão Aurora',
      ownerEmail: 'dona@aurora.pt',
      ownerName: 'Dona Aurora',
      passwordHash: 'argon2id$hash',
      trialEndsAt: null,
    });

    await expect(
      createTenantWithOwner(pool, {
        slug: 'SALAO-AURORA',
        name: 'Outro Salão',
        ownerEmail: 'outro@example.pt',
        ownerName: 'Outro Owner',
        passwordHash: 'argon2id$outro-hash',
        trialEndsAt: null,
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('impede emails de owner repetidos sem distinguir maiúsculas de minúsculas', async () => {
    await createTenantWithOwner(pool, {
      slug: 'salao-aurora',
      name: 'Salão Aurora',
      ownerEmail: 'dona@aurora.pt',
      ownerName: 'Dona Aurora',
      passwordHash: 'argon2id$hash',
      trialEndsAt: null,
    });

    await expect(
      createTenantWithOwner(pool, {
        slug: 'salao-nova-luz',
        name: 'Salão Nova Luz',
        ownerEmail: 'DONA@AURORA.PT',
        ownerName: 'Outra Dona',
        passwordHash: 'argon2id$outro-hash',
        trialEndsAt: null,
      }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('reverte o tenant quando os dados obrigatórios do owner são inválidos', async () => {
    const antes = await pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM tenants',
    );

    await expect(
      createTenantWithOwner(pool, {
        slug: 'tenant-a-reverter',
        name: 'Tenant a Reverter',
        ownerEmail: 'rollback@example.pt',
        ownerName: 'Owner Inválido',
        passwordHash: '',
        trialEndsAt: null,
      }),
    ).rejects.toMatchObject({ code: '23514' });

    const depois = await pool.query<{ total: string }>(
      'SELECT count(*)::text AS total FROM tenants',
    );
    expect(depois.rows[0]).toEqual(antes.rows[0]);
  });

  it('permite apenas um owner por tenant', async () => {
    const tenant = await createTenantWithOwner(pool, {
      slug: 'salao-aurora',
      name: 'Salão Aurora',
      ownerEmail: 'dona@aurora.pt',
      ownerName: 'Dona Aurora',
      passwordHash: 'argon2id$hash',
      trialEndsAt: null,
    });

    await expect(
      pool.query(
        `INSERT INTO tenant_users
           (tenant_id, email, name, role, permissions, is_owner, password_hash)
         VALUES ($1, 'segundo-owner@example.pt', 'Segundo Owner', 'admin', 20, true, 'hash')`,
        [tenant.tenant.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('cria tenant e owner atomicamente com a role runtime sob FORCE RLS', async () => {
    const roleName = 'database_runtime_test_role';
    const rolePassword = 'runtime-test-password';
    await pool.query(
      `CREATE ROLE ${roleName}
       LOGIN PASSWORD '${rolePassword}' NOSUPERUSER NOBYPASSRLS`,
    );
    await pool.query(`GRANT USAGE ON SCHEMA public TO ${roleName}`);
    await pool.query(
      `GRANT SELECT, INSERT ON tenants, tenant_users TO ${roleName}`,
    );

    const runtimeUrl = new URL(connectionString);
    runtimeUrl.username = roleName;
    runtimeUrl.password = rolePassword;
    const runtimePool = new Pool({ connectionString: runtimeUrl.toString() });

    try {
      const resultado = await createTenantWithOwner(runtimePool, {
        slug: 'tenant-role-runtime',
        name: 'Tenant Role Runtime',
        ownerEmail: 'runtime@example.pt',
        ownerName: 'Owner Runtime',
        passwordHash: 'argon2id$runtime-hash',
        trialEndsAt: null,
      });

      expect(resultado.owner.tenantId).toBe(resultado.tenant.id);
      const persistido = await pool.query<{ tenants: string; owners: string }>(
        `SELECT
           (SELECT count(*) FROM tenants WHERE id = $1)::text AS tenants,
           (SELECT count(*) FROM tenant_users
              WHERE tenant_id = $1 AND is_owner)::text AS owners`,
        [resultado.tenant.id],
      );
      expect(persistido.rows[0]).toEqual({ tenants: '1', owners: '1' });

      await expect(
        createTenantWithOwner(runtimePool, {
          slug: 'tenant-runtime-rollback',
          name: 'Tenant Runtime Rollback',
          ownerEmail: 'runtime-rollback@example.pt',
          ownerName: 'Owner Runtime Inválido',
          passwordHash: '',
          trialEndsAt: null,
        }),
      ).rejects.toMatchObject({ code: '23514' });

      const revertido = await pool.query<{ tenants: string; owners: string }>(
        `SELECT
           (SELECT count(*) FROM tenants
              WHERE slug = 'tenant-runtime-rollback')::text AS tenants,
           (SELECT count(*) FROM tenant_users
              WHERE email = 'runtime-rollback@example.pt')::text AS owners`,
      );
      expect(revertido.rows[0]).toEqual({ tenants: '0', owners: '0' });
    } finally {
      try {
        await runtimePool.end();
      } finally {
        await pool.query(`DROP OWNED BY ${roleName}`);
        await pool.query(`DROP ROLE ${roleName}`);
      }
    }
  });
});

describe('isolamento RLS', () => {
  beforeAll(async () => {
    // Garante que a role de teste não existe antes do primeiro teste
    // (limpa quaisquer resíduos de corridas anteriores).
    try {
      await pool.query('DROP OWNED BY database_rls_test_role CASCADE');
    } catch {
      // best-effort
    }
    try {
      await pool.query('DROP ROLE IF EXISTS database_rls_test_role');
    } catch {
      // best-effort
    }
  });

  afterEach(async () => {
    // Idem após cada teste.
    try {
      await pool.query('DROP OWNED BY database_rls_test_role CASCADE');
    } catch {
      // best-effort
    }
    try {
      await pool.query('DROP ROLE IF EXISTS database_rls_test_role');
    } catch {
      // best-effort
    }
  });

  it('falha fechado sem app.tenant_id e expõe apenas o tenant configurado', async () => {
    await pool.query('CREATE ROLE database_rls_test_role');
    await pool.query('GRANT USAGE ON SCHEMA public TO database_rls_test_role');
    await pool.query(
      'GRANT SELECT ON tenants, tenant_users TO database_rls_test_role',
    );

    const created = await createTenantWithOwner(pool, {
      slug: 'salao-aurora',
      name: 'Salão Aurora',
      ownerEmail: 'dona@aurora.pt',
      ownerName: 'Dona Aurora',
      passwordHash: 'argon2id$hash',
      trialEndsAt: null,
    });
    const tenantId = created.tenant.id;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE database_rls_test_role');

      const semContexto = await client.query<{ total: string }>(
        'SELECT count(*)::text AS total FROM tenants',
      );
      expect(semContexto.rows[0]?.total).toBe('0');

      await client.query("SELECT set_config('app.tenant_id', $1, true)", [
        tenantId,
      ]);
      const comContexto = await client.query<{ id: string }>(
        'SELECT id FROM tenants',
      );
      expect(comContexto.rows).toEqual([{ id: tenantId }]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});

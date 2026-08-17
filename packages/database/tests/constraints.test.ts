import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from '../src/migrations.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error('TEST_DATABASE_URL é obrigatório nos testes de integração.');

const databaseName = `beauty_saas_constraints_${randomUUID().replaceAll('-', '')}`;
const adminPool = new Pool({ connectionString });
const databaseUrl = new URL(connectionString);
databaseUrl.pathname = `/${databaseName}`;
const pool = new Pool({ connectionString: databaseUrl.toString() });

beforeAll(async () => {
  await adminPool.query(`CREATE DATABASE "${databaseName}"`);
  await runMigrations(pool);
});

afterAll(async () => {
  await pool.end();
  try {
    await adminPool.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
      [databaseName],
    );
    await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  } finally {
    await adminPool.end();
  }
});

it('impede emails repetidos no mesmo tenant sem distinguir maiúsculas de minúsculas', async () => {
  const tenant = await pool.query<{ id: string }>(
    `INSERT INTO tenants (slug, name)
     VALUES ('tenant-email-unico', 'Tenant Email Único')
     RETURNING id`,
  );
  const tenantId = tenant.rows[0]!.id;

  await pool.query(
    `INSERT INTO tenant_users
       (tenant_id, email, name, role, password_hash)
     VALUES ($1, 'profissional@example.pt', 'Profissional', 'professional', 'hash')`,
    [tenantId],
  );

  await expect(
    pool.query(
      `INSERT INTO tenant_users
         (tenant_id, email, name, role, password_hash)
       VALUES ($1, 'PROFISSIONAL@EXAMPLE.PT', 'Outra Profissional', 'professional', 'hash')`,
      [tenantId],
    ),
  ).rejects.toMatchObject({
    code: '23505',
    constraint: 'tenant_users_tenant_email_ci_unique',
  });
});

it('permite o mesmo email de profissional em tenants diferentes sem distinguir maiúsculas de minúsculas', async () => {
  const tenants = await pool.query<{ id: string; slug: string }>(
    `INSERT INTO tenants (slug, name)
     VALUES
       ('tenant-email-partilhado-a', 'Tenant Email Partilhado A'),
       ('tenant-email-partilhado-b', 'Tenant Email Partilhado B')
     RETURNING id, slug`,
  );
  const tenantIds = new Map(
    tenants.rows.map(({ id, slug }) => [slug, id] as const),
  );

  await pool.query(
    `INSERT INTO tenant_users
       (tenant_id, email, name, role, password_hash)
     VALUES ($1, 'profissional-partilhada@example.pt', 'Profissional A', 'professional', 'hash')`,
    [tenantIds.get('tenant-email-partilhado-a')],
  );

  await expect(
    pool.query(
      `INSERT INTO tenant_users
         (tenant_id, email, name, role, password_hash)
       VALUES ($1, 'PROFISSIONAL-PARTILHADA@EXAMPLE.PT', 'Profissional B', 'professional', 'hash')`,
      [tenantIds.get('tenant-email-partilhado-b')],
    ),
  ).resolves.toMatchObject({ rowCount: 1 });
});

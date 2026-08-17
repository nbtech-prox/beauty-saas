import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expect, it } from 'vitest';
import { runMigrations } from '../src/migrations.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error('TEST_DATABASE_URL é obrigatório nos testes de integração.');

it('serializa runners concorrentes numa base de dados vazia', async () => {
  const databaseName = `beauty_saas_migrations_${randomUUID().replaceAll('-', '')}`;
  const adminPool = new Pool({ connectionString });
  const databaseUrl = new URL(connectionString);
  databaseUrl.pathname = `/${databaseName}`;
  const runnerPools = Array.from(
    { length: 6 },
    () => new Pool({ connectionString: databaseUrl.toString() }),
  );

  try {
    await adminPool.query(`CREATE DATABASE "${databaseName}"`);

    await Promise.all(runnerPools.map((pool) => runMigrations(pool)));

    const result = await runnerPools[0]!.query<{
      migrations: string;
      tenants: string | null;
      tenantUsers: string | null;
    }>(`
      SELECT
        (SELECT count(*)::text FROM schema_migrations) AS migrations,
        to_regclass('public.tenants')::text AS tenants,
        to_regclass('public.tenant_users')::text AS "tenantUsers"
    `);
    expect(result.rows[0]).toEqual({
      migrations: '2',
      tenants: 'tenants',
      tenantUsers: 'tenant_users',
    });
  } finally {
    await Promise.allSettled(runnerPools.map((pool) => pool.end()));
    try {
      await adminPool.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
        [databaseName],
      );
    } finally {
      try {
        await adminPool.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      } finally {
        await adminPool.end();
      }
    }
  }
});

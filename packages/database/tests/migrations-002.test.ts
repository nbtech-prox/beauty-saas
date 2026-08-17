import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { Pool } from 'pg';
import { runMigrations } from '../src/migrations.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString)
  throw new Error('TEST_DATABASE_URL é obrigatório nos testes de integração.');

const databaseName = `beauty_saas_m002_${randomUUID().replaceAll('-', '')}`;
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

const expectedTables = [
  'subscriptions',
  'webhook_events',
  'audit_logs',
] as const;

for (const table of expectedTables) {
  it(`regista a migration 002_subscriptions_webhook_events_audit.sql em schema_migrations`, async () => {
    const markers = await pool.query<{ name: string }>(
      'SELECT name FROM schema_migrations ORDER BY name',
    );
    expect(markers.rows.map((row) => row.name)).toContain(
      '002_subscriptions_webhook_events_audit.sql',
    );
    expect(markers.rows.map((row) => row.name)).toContain(
      '001_tenants_and_owner.sql',
    );
  });

  it(`cria a tabela ${table} com RLS forçado e fail-closed`, async () => {
    const rls = await pool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class
        WHERE relname = $1 AND relkind = 'r'`,
      [table],
    );
    expect(rls.rows).toEqual([
      { relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });
}

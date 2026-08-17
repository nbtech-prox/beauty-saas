import type { Pool, PoolClient } from 'pg';
import { expect, it, vi } from 'vitest';
import { runMigrations } from '../src/migrations.js';

it('preserva o erro original e destrói a ligação quando o ROLLBACK falha', async () => {
  const originalError = new Error('migration failed');
  const rollbackError = new Error('rollback failed');
  const release = vi.fn();
  const query = vi.fn(async (sql: string) => {
    if (sql === 'BEGIN') return;
    if (sql === 'ROLLBACK') throw rollbackError;
    if (sql.startsWith('SELECT pg_advisory_xact_lock')) return;
    if (sql.includes('CREATE TABLE IF NOT EXISTS schema_migrations')) return;
    if (sql === 'SELECT name, checksum FROM schema_migrations')
      return { rowCount: 0, rows: [] };
    throw originalError;
  });
  const client = { query, release } as unknown as PoolClient;
  const pool = {
    connect: vi.fn(async () => client),
  } as unknown as Pool;

  const rejection = await runMigrations(pool).catch((error: unknown) => error);

  expect(rejection).toBeInstanceOf(AggregateError);
  expect((rejection as AggregateError).errors).toEqual([
    originalError,
    rollbackError,
  ]);
  expect(release).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledWith(rollbackError);
});

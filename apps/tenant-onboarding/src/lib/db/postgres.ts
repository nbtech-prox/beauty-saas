/**
 * Pool singleton da base de dados PostgreSQL (control plane).
 *
 * Lê `DATABASE_URL` (runtime tenant-scoped, role diferente do
 * `DATABASE_MIGRATION_URL`). Em testes, usa `TEST_DATABASE_URL`
 * como fallback.
 */
import { Pool } from 'pg';

let cachedPool: Pool | null = null;

export function getPool(): Pool {
  if (cachedPool) return cachedPool;

  const connectionString =
    process.env['TEST_DATABASE_URL'] ?? process.env['DATABASE_URL'];

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL ausente — configura a env var antes de chamar getPool()',
    );
  }

  cachedPool = new Pool({
    connectionString,
    max: Number(process.env['DB_POOL_MAX'] ?? 10),
    idleTimeoutMillis: 30_000,
  });

  return cachedPool;
}

/** Apenas para testes — repõe o singleton. */
export function __resetPoolForTests(): void {
  cachedPool?.end().catch(() => undefined);
  cachedPool = null;
}

/**
 * Postgres connection pool — lazy singleton para a `platform-admin`.
 *
 * A primeira chamada a `getPool()` lê `process.env.DATABASE_URL`, cria
 * um `pg.Pool` reutilizável e corre `runMigrations` (idempotente) para
 * garantir que o schema está pronto. Chamadas subsequentes partilham o
 * mesmo pool.
 *
 * `closePool()` é exposto para os testes de integração/handlers long-lived
 * poderem libertar sockets entre runs sem perder o estado de migrations.
 */
import { Pool } from 'pg';
import { runMigrations } from '@beauty-saas/database';

let pooled: Pool | null = null;
let migrationsPromise: Promise<void> | null = null;
const migrationsApplied = new WeakSet<Pool>();

function readDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === '') {
    throw new Error('DATABASE_URL nao configurado');
  }
  return url;
}

async function applyMigrationsOnce(pool: Pool): Promise<void> {
  if (migrationsApplied.has(pool)) return;
  if (!migrationsPromise) {
    migrationsPromise = runMigrations(pool).then(() => {
      migrationsApplied.add(pool);
    });
  }
  await migrationsPromise;
}

export async function getPool(): Promise<Pool> {
  if (pooled) {
    await applyMigrationsOnce(pooled);
    return pooled;
  }
  const connectionString = readDatabaseUrl();
  const created = new Pool({ connectionString, max: 10 });
  pooled = created;
  await applyMigrationsOnce(created);
  return created;
}

export async function closePool(): Promise<void> {
  if (!pooled) return;
  const current = pooled;
  pooled = null;
  migrationsPromise = null;
  await current.end();
}

/**
 * Reset interno do singleton — reservado para scripts de teste que
 * recriam a base de dados entre casos. Não exportado por design mas
 * é exportado como API de teste (precisa de ser referenciado para
 * `noUnusedLocals`).
 */
export function _resetPoolForTesting(): void {
  pooled = null;
  migrationsPromise = null;
}

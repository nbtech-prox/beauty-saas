import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expect, it } from 'vitest';
import {
  LegacyMigrationChecksumMissingError,
  MigrationChecksumMismatchError,
  UnknownLegacyMigrationError,
  runMigrations,
} from '../src/migrations.js';

const configuredConnectionString = process.env.TEST_DATABASE_URL;
if (!configuredConnectionString)
  throw new Error('TEST_DATABASE_URL é obrigatório nos testes de integração.');
const connectionString: string = configuredConnectionString;

const migrationName = '001_tenants_and_owner.sql';
const migrationChecksum =
  '4732882c5d8e7cb59c54c392252393b6346b7532c40058e511a0af5e023d827a';

async function withTemporaryDatabase(
  prefix: string,
  test: (pool: Pool) => Promise<void>,
): Promise<void> {
  const databaseName = `${prefix}_${randomUUID().replaceAll('-', '')}`;
  const adminPool = new Pool({ connectionString });
  const databaseUrl = new URL(connectionString);
  databaseUrl.pathname = `/${databaseName}`;
  const pool = new Pool({ connectionString: databaseUrl.toString() });

  try {
    await adminPool.query(
      `CREATE DATABASE "${databaseName}" TEMPLATE template0`,
    );
    await test(pool);
  } finally {
    try {
      await pool.end();
    } finally {
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
  }
}

async function createLegacyMarker(
  pool: Pool,
  name = migrationName,
): Promise<void> {
  await pool.query(`
    CREATE TABLE schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
}

it('recusa por omissão adoptar o checksum de um marker legado conhecido', async () => {
  await withTemporaryDatabase(
    'beauty_saas_legacy_checksum_default',
    async (pool) => {
      await createLegacyMarker(pool);

      const error = await runMigrations(pool).catch(
        (reason: unknown) => reason,
      );

      expect(error).toBeInstanceOf(LegacyMigrationChecksumMissingError);
      expect(error).toMatchObject({
        code: 'legacy_migration_checksum_missing',
        migrationName,
        expectedChecksum: migrationChecksum,
      });
      const columns = await pool.query<{ checksumColumns: string }>(`
      SELECT count(*)::text AS "checksumColumns"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
        AND column_name = 'checksum'
    `);
      expect(columns.rows[0]?.checksumColumns).toBe('0');
    },
  );
});

it('adopta explicitamente uma schema_migrations legada sem reaplicar markers conhecidos', async () => {
  await withTemporaryDatabase(
    'beauty_saas_legacy_checksum_adopt',
    async (pool) => {
      await createLegacyMarker(pool);

      // Adopção de TODOS os markers legados que o Runner conhece: só assim
      // podemos validar `runMigrations` no-op sem que `002` falhe por
      // ausência de `tenants`. Marcamos igualmente a 002 como legacy para
      // que este cenário seja fiel ao caso real: "uma base antiga sem
      // checksum para um conjunto de migrations".
      await pool.query(
        "INSERT INTO schema_migrations (name) VALUES ('002_subscriptions_webhook_events_audit.sql')",
      );

      await runMigrations(pool, { adoptLegacyChecksums: true });

      const upgraded = await pool.query<{
        checksum: string;
        isNullable: string;
        markers: string;
        tenants: string | null;
      }>(`
      SELECT
        (SELECT checksum FROM schema_migrations WHERE name = '001_tenants_and_owner.sql') AS checksum,
        (SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'schema_migrations'
            AND column_name = 'checksum') AS "isNullable",
        (SELECT count(*)::text FROM schema_migrations) AS markers,
        to_regclass('public.tenants')::text AS tenants
    `);
      expect(upgraded.rows[0]).toEqual({
        checksum: migrationChecksum,
        isNullable: 'NO',
        markers: '2',
        tenants: null,
      });

      // Adopção preserva os markers mas NÃO aplica o SQL legado. O
      // operador tem de aplicar manualmente os ficheiros legados antes
      // de poder confiar na transacção corrente para migrations novas.
      const fs = await import('node:fs/promises');
      const legacySql001 = await fs.readFile(
        new URL('../migrations/001_tenants_and_owner.sql', import.meta.url),
        'utf8',
      );
      await pool.query(legacySql001);

      await runMigrations(pool);

      const rerun = await pool.query<{ markers: string }>(`
      SELECT count(*)::text AS markers FROM schema_migrations
    `);
      expect(rerun.rows[0]).toEqual({
        markers: '2',
      });
    },
  );
});

it('recusa adoptar um marker legado desconhecido', async () => {
  await withTemporaryDatabase(
    'beauty_saas_legacy_checksum_unknown',
    async (pool) => {
      const unknownMigrationName = '999_unknown.sql';
      await createLegacyMarker(pool, unknownMigrationName);

      const error = await runMigrations(pool, {
        adoptLegacyChecksums: true,
      }).catch((reason: unknown) => reason);

      expect(error).toBeInstanceOf(UnknownLegacyMigrationError);
      expect(error).toMatchObject({
        code: 'unknown_legacy_migration',
        migrationName: unknownMigrationName,
        message: `Cannot adopt checksum for unknown legacy migration ${unknownMigrationName}`,
      });
      expect(error).not.toHaveProperty('query');
      expect(error).not.toHaveProperty('connectionString');

      const legacyState = await pool.query<{
        checksumColumns: string;
        markers: string;
      }>(`
      SELECT
        (SELECT count(*)::text FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'schema_migrations'
            AND column_name = 'checksum') AS "checksumColumns",
        (SELECT count(*)::text FROM schema_migrations) AS markers
    `);
      expect(legacyState.rows[0]).toEqual({
        checksumColumns: '0',
        markers: '1',
      });
    },
  );
});

it('recusa uma migration aplicada cujo checksum foi adulterado', async () => {
  await withTemporaryDatabase('beauty_saas_checksum', async (pool) => {
    const adulteratedChecksum = '0'.repeat(64);

    await runMigrations(pool);
    const marker = await pool.query<{ checksum: string }>(
      'SELECT checksum FROM schema_migrations WHERE name = $1',
      [migrationName],
    );
    expect(marker.rows[0]?.checksum).toBe(migrationChecksum);
    await pool.query('UPDATE schema_migrations SET checksum = $1', [
      adulteratedChecksum,
    ]);

    const error = await runMigrations(pool).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MigrationChecksumMismatchError);
    expect(error).toMatchObject({
      code: 'migration_checksum_mismatch',
      migrationName,
      expectedChecksum: adulteratedChecksum,
      actualChecksum: migrationChecksum,
    });
  });
});

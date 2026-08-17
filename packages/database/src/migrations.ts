import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';

const migrations = [
  {
    name: '001_tenants_and_owner.sql',
    url: new URL('../migrations/001_tenants_and_owner.sql', import.meta.url),
  },
  {
    name: '002_subscriptions_webhook_events_audit.sql',
    url: new URL(
      '../migrations/002_subscriptions_webhook_events_audit.sql',
      import.meta.url,
    ),
  },
] as const;

interface PreparedMigration {
  name: string;
  sql: string;
  checksum: string;
}

export interface RunMigrationsOptions {
  adoptLegacyChecksums?: boolean;
}

export class LegacyMigrationChecksumMissingError extends Error {
  readonly code = 'legacy_migration_checksum_missing' as const;

  constructor(
    readonly migrationName: string,
    readonly expectedChecksum: string,
  ) {
    super(
      `Migration ${migrationName} has no checksum; rerun with adoptLegacyChecksums enabled to adopt ${expectedChecksum}`,
    );
    this.name = 'LegacyMigrationChecksumMissingError';
  }
}

export class UnknownLegacyMigrationError extends Error {
  readonly code = 'unknown_legacy_migration' as const;

  constructor(readonly migrationName: string) {
    super(
      `Cannot adopt checksum for unknown legacy migration ${migrationName}`,
    );
    this.name = 'UnknownLegacyMigrationError';
  }
}

export class MigrationChecksumMismatchError extends Error {
  readonly code = 'migration_checksum_mismatch' as const;

  constructor(
    readonly migrationName: string,
    readonly expectedChecksum: string,
    readonly actualChecksum: string,
  ) {
    super(
      `Checksum mismatch for migration ${migrationName}: expected ${expectedChecksum}, got ${actualChecksum}`,
    );
    this.name = 'MigrationChecksumMismatchError';
  }
}

export async function runMigrations(
  pool: Pool,
  options: RunMigrationsOptions = {},
): Promise<void> {
  const client = await pool.connect();
  let released = false;
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock($1, $2)',
      [1_835_620_923, 1_765_628_737],
    );
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await client.query(
      'ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text',
    );

    const preparedMigrations = await Promise.all(
      migrations.map(async ({ name, url }) => {
        const sql = await readFile(fileURLToPath(url), 'utf8');
        return {
          name,
          sql,
          checksum: createHash('sha256').update(sql).digest('hex'),
        };
      }),
    );
    await adoptLegacyChecksums(client, preparedMigrations, options);
    await client.query(
      'ALTER TABLE schema_migrations ALTER COLUMN checksum SET NOT NULL',
    );
    const appliedNames = await validateAppliedMigrations(
      client,
      preparedMigrations,
    );

    for (const migration of preparedMigrations)
      if (!appliedNames.has(migration.name))
        await applyMigration(client, migration);
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      released = true;
      client.release(rollbackError instanceof Error ? rollbackError : true);
      throw new AggregateError(
        [error, rollbackError],
        'Migration and rollback failed',
      );
    }
    throw error;
  } finally {
    if (!released) client.release();
  }
}

async function adoptLegacyChecksums(
  client: PoolClient,
  preparedMigrations: readonly PreparedMigration[],
  options: RunMigrationsOptions,
): Promise<void> {
  const missing = await client.query<{ name: string }>(
    'SELECT name FROM schema_migrations WHERE checksum IS NULL ORDER BY name',
  );
  const preparedByName = new Map(
    preparedMigrations.map((migration) => [migration.name, migration]),
  );

  for (const { name } of missing.rows) {
    const migration = preparedByName.get(name);
    if (!migration) throw new UnknownLegacyMigrationError(name);
    if (!options.adoptLegacyChecksums)
      throw new LegacyMigrationChecksumMissingError(name, migration.checksum);
    await client.query(
      'UPDATE schema_migrations SET checksum = $2 WHERE name = $1 AND checksum IS NULL',
      [name, migration.checksum],
    );
  }
}

async function validateAppliedMigrations(
  client: PoolClient,
  preparedMigrations: readonly PreparedMigration[],
): Promise<Set<string>> {
  const applied = await client.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  const appliedChecksums = new Map(
    applied.rows.map(({ name, checksum }) => [name, checksum]),
  );

  for (const migration of preparedMigrations) {
    const expectedChecksum = appliedChecksums.get(migration.name);
    if (expectedChecksum === undefined) continue;
    if (expectedChecksum !== migration.checksum)
      throw new MigrationChecksumMismatchError(
        migration.name,
        expectedChecksum,
        migration.checksum,
      );
  }

  return new Set(appliedChecksums.keys());
}

async function applyMigration(
  client: PoolClient,
  migration: PreparedMigration,
): Promise<void> {
  await client.query(migration.sql);
  await client.query(
    'INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)',
    [migration.name, migration.checksum],
  );
}

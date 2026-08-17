import { Pool } from 'pg';
import { requireMigrationDatabaseUrl } from './migration-config.js';
import { runMigrations } from './migrations.js';

async function main(): Promise<number> {
  const migrationPool = new Pool({
    connectionString: requireMigrationDatabaseUrl(process.env),
  });
  try {
    await runMigrations(migrationPool);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Falha desconhecida.';
    process.stderr.write(`Falha ao aplicar migrations: ${message}\n`);
    await migrationPool.end().catch(() => undefined);
    process.exitCode = 1;
    return 1;
  }

  await migrationPool.end();
  process.stdout.write('Migrations PostgreSQL aplicadas com sucesso.\n');
  return 0;
}

await main();

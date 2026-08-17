export type MigrationEnvironment = Readonly<Record<string, string | undefined>>;

export class MigrationDatabaseUrlError extends Error {
  readonly code = 'DATABASE_MIGRATION_URL_REQUIRED';

  constructor() {
    super('DATABASE_MIGRATION_URL é obrigatório para executar migrations.');
    this.name = 'MigrationDatabaseUrlError';
  }
}

/**
 * Lê a credencial de migrations do ambiente e devolve-a validada.
 *
 * Regras:
 * - `DATABASE_MIGRATION_URL` é obrigatória. `DATABASE_URL` nunca é utilizada
 *   como fallback.
 * - O valor é aparado nas extremidades antes da validação. Conteúdo interno
 *   (incluindo whitespace legítimo) é preservado.
 * - Strings vazias, `undefined`, ou apenas whitespace são rejeitadas com
 *   `MigrationDatabaseUrlError`. A mensagem de erro nunca inclui o valor
 *   submetido, para não expor connection strings em logs/stderr.
 */
export function requireMigrationDatabaseUrl(
  environment: MigrationEnvironment,
): string {
  const rawValue = environment.DATABASE_MIGRATION_URL;
  const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : '';

  if (trimmedValue.length === 0) throw new MigrationDatabaseUrlError();

  return trimmedValue;
}

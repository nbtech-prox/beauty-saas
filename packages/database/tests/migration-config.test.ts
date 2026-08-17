import { describe, expect, it } from 'vitest';
import {
  MigrationDatabaseUrlError,
  requireMigrationDatabaseUrl,
} from '../src/migration-config.js';

describe('requireMigrationDatabaseUrl', () => {
  it('recusa a credencial runtime quando a credencial de migrations está ausente', () => {
    const runtimeConnectionString =
      'postgresql://beauty_runtime:***@localhost/beauty_saas';

    let capturedError: unknown;
    try {
      requireMigrationDatabaseUrl({ DATABASE_URL: runtimeConnectionString });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(MigrationDatabaseUrlError);
    expect(capturedError).toMatchObject({
      name: 'MigrationDatabaseUrlError',
      code: 'DATABASE_MIGRATION_URL_REQUIRED',
      message: 'DATABASE_MIGRATION_URL é obrigatório para executar migrations.',
    });
    expect(String(capturedError)).not.toContain(runtimeConnectionString);
  });

  it('recusa uma credencial de migrations composta apenas por espaços', () => {
    let capturedError: unknown;
    try {
      requireMigrationDatabaseUrl({ DATABASE_MIGRATION_URL: '   ' });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(MigrationDatabaseUrlError);
    expect(capturedError).toMatchObject({
      code: 'DATABASE_MIGRATION_URL_REQUIRED',
    });
  });

  it('recusa uma credencial de migrations vazia (string sem caracteres)', () => {
    expect(() =>
      requireMigrationDatabaseUrl({ DATABASE_MIGRATION_URL: '' }),
    ).toThrow(MigrationDatabaseUrlError);
  });

  it('rejeita whitespace à esquerda ou à direita quando é o único conteúdo', () => {
    const whitespaceOnly = ' \t \n ';

    let capturedError: unknown;
    try {
      requireMigrationDatabaseUrl({ DATABASE_MIGRATION_URL: whitespaceOnly });
    } catch (error) {
      capturedError = error;
    }

    expect(capturedError).toBeInstanceOf(MigrationDatabaseUrlError);
    expect(String(capturedError)).not.toContain(whitespaceOnly);
  });

  it('devolve exactamente a credencial de migrations quando ambas existem', () => {
    const migrationConnectionString =
      'postgresql://beauty_migrator:***@localhost/beauty_saas';

    expect(
      requireMigrationDatabaseUrl({
        DATABASE_URL: 'postgresql://beauty_runtime:***@localhost/beauty_saas',
        DATABASE_MIGRATION_URL: migrationConnectionString,
      }),
    ).toBe(migrationConnectionString);
  });

  it('preserva whitespace interno legítimo na connection string devolvida', () => {
    // Trim só deve remover padding nas extremidades; conteúdo interno mantém-se intacto.
    const padded = '  postgresql://user:pass@host/db  ';
    const trimmed = 'postgresql://user:pass@host/db';

    expect(
      requireMigrationDatabaseUrl({ DATABASE_MIGRATION_URL: padded }),
    ).toBe(trimmed);
  });
});

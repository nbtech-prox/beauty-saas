import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const cliPath = new URL('../src/migrate-cli.ts', import.meta.url).pathname;
const tsxBin = new URL('../node_modules/.bin/tsx', import.meta.url).pathname;

function runCli(environment: Record<string, string | undefined>): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const cleanedEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') cleanedEnv[key] = value;
  }
  // Garante que DATABASE_MIGRATION_URL parte do estado fornecido pelo teste.
  delete cleanedEnv.DATABASE_MIGRATION_URL;
  for (const [key, value] of Object.entries(environment)) {
    if (typeof value === 'string') cleanedEnv[key] = value;
    else delete cleanedEnv[key];
  }

  // O binário `tsx` é um wrapper sh; precisa de shell para ser executável.
  return spawnSync('/bin/sh', [tsxBin, cliPath], {
    env: cleanedEnv,
    encoding: 'utf8',
  });
}

describe('migrate-cli', () => {
  it('sai com código 1 e mensagem segura quando DATABASE_MIGRATION_URL está ausente', () => {
    const fakeConnectionString =
      'postgresql://beauty_runtime:***@localhost/beauty_saas';
    const result = runCli({ DATABASE_URL: fakeConnectionString });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /DATABASE_MIGRATION_URL é obrigatório para executar migrations\./,
    );
    expect(result.stderr).not.toContain(fakeConnectionString);
    expect(result.stdout).not.toContain(fakeConnectionString);
    expect(result.stdout).not.toContain('Migrations PostgreSQL aplicadas');
  });

  it('sai com código 1 e mensagem segura quando DATABASE_MIGRATION_URL tem só whitespace', () => {
    const marker = `segredo-${randomUUID()}`;
    const result = runCli({ DATABASE_MIGRATION_URL: '   \n\t  ' });

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(
      /DATABASE_MIGRATION_URL é obrigatório para executar migrations\./,
    );
    expect(result.stderr).not.toContain(marker);
    expect(result.stdout).not.toContain(marker);
  });

  it('não tenta abrir um Pool quando a validação da credencial falha', () => {
    const result = runCli({});

    expect(result.status).toBe(1);
    // Quando a validação falha, nenhuma mensagem de sucesso nem stack trace
    // de pg.Pool deve chegar a stdout.
    expect(result.stdout).toBe('');
  });
});

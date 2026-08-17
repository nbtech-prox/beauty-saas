# @beauty-saas/database

Persistência PostgreSQL server-only do control plane do Beauty SaaS.

> **Estado:** parcial — Fase 1 em curso

|> **Última actualização:** 2026-08-16

## Responsabilidades

Este package concentra:

- execução ordenada de migrations SQL;
- persistência transaccional do control plane;
- constraints e invariantes que devem ser garantidas pela base de dados;
- políticas PostgreSQL Row-Level Security;
- repositories pequenos, com queries parametrizadas.

Não contém componentes React, código browser, autenticação HTTP nem acesso directo ao data plane `joycehairbeauty`.

## Stack

| Componente |                               Versão | Utilização                               |
| ---------- | -----------------------------------: | ---------------------------------------- |
| PostgreSQL | 18 em produção; 17 no harness actual | constraints, transacções e RLS           |
| `pg`       |                               8.23.0 | cliente PostgreSQL                       |
| TypeScript |                                5.9.3 | tipos e repositories server-only         |
| Vitest     |                                2.1.9 | testes de integração                     |
| Docker     |                         daemon local | PostgreSQL descartável durante os testes |

## Estado implementado

### Migration `001_tenants_and_owner.sql`

Implementa:

- `tenants`;
- `tenant_users`;
- UUIDs gerados pelo PostgreSQL;
- estados `trialing`, `active`, `past_due`, `canceled` e `suspended`;
- defaults `Europe/Lisbon`, `EUR` e `pt-PT`;
- `trial_ends_at` e timestamps `timestamptz`;
- slug único sem distinguir maiúsculas de minúsculas;
- owner único por tenant;
- email de owner globalmente único sem distinguir maiúsculas de minúsculas;
- `password_hash` obrigatório;
- `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`;
- policies fail-closed baseadas em `app.tenant_id`.

### `createTenantWithOwner`

Cria tenant e owner numa única transacção:

1. obtém um UUID através de `gen_random_uuid()`;
2. define `app.tenant_id` apenas para a transacção;
3. cria o tenant com esse UUID;
4. cria o owner com `role = admin` e `is_owner = true`;
5. confirma os dois registos ou reverte tudo.

Este caminho é testado com uma role PostgreSQL `LOGIN`, `NOSUPERUSER` e `NOBYPASSRLS`; não depende de superuser para ultrapassar RLS.

O `passwordHash` existe apenas no input e na coluna `password_hash`; nunca faz parte do resultado público do repository.

### Migration `002_subscriptions_webhook_events_audit.sql`

Adiciona três tabelas tenant-scoped com `FORCE ROW LEVEL SECURITY` e policies fail-closed baseadas em `app.tenant_id`:

- `subscriptions` — `external_id` único para reconciliação idempotente; `UNIQUE (tenant_id, plan_code)`; `FK (tenant_id) → tenants(id) ON DELETE RESTRICT`; CHECK sobre `stripe_price_id LIKE 'price\_%'` e `status`/`plan_code` enums.
- `webhook_events` — `UNIQUE (provider, event_id)` para a chave de idempotência do webhook; `FK (tenant_id) → tenants(id) ON DELETE SET NULL`; aceita `tenant_id IS NULL` desde que o actor seja `BYPASSRLS`.
- `audit_logs` — `payload jsonb NOT NULL DEFAULT '{}'`; `FK (tenant_id) ON DELETE SET NULL`; `FK (actor_user_id) → tenant_users(id) ON DELETE SET NULL`.

Os três repositories tipados (`subscription-repository`, `webhook-event-repository`, `audit-log-repository`) operam sob uma role `NOSUPERUSER NOBYPASSRLS` com `app.tenant_id` definido localmente à transacção; cobertura cross-tenant é provada nos testes `rls-isolation.test.ts`.

## API actual

```ts
import { createTenantWithOwner, runMigrations } from '@beauty-saas/database';
```

A API é deliberadamente pequena. Novos repositories só devem ser exportados quando tiverem invariantes e testes de integração reais.

## Comandos

```bash
# Aplicar migrations à DATABASE_MIGRATION_URL
pnpm --filter @beauty-saas/database migrate

# Executar PostgreSQL descartável e todos os testes
pnpm --filter @beauty-saas/database test

# Verificar tipos
pnpm --filter @beauty-saas/database typecheck
```

## Credenciais PostgreSQL

- `DATABASE_URL`: credencial runtime tenant-scoped, sem poder para aplicar migrations;
- `DATABASE_MIGRATION_URL`: credencial distinta da role de migrations, usada exclusivamente pelo comando `migrate`.

O CLI falha se `DATABASE_MIGRATION_URL` estiver ausente, vazia ou só com whitespace, mesmo que `DATABASE_URL` exista. Não existe fallback para a credencial runtime e nenhuma connection string é impressa em mensagens de erro, logs, stdout ou stderr. O `Pool` dedicado é terminado (`pool.end()`) em caso de falha para libertar a ligação antes de sair com código `1`.

O teste exige Docker funcional. O harness cria um container PostgreSQL temporário, executa a suite e remove-o no final.

## Evidência actual

- 74 testes (suite completa com PostgreSQL descartável 17-alpine) verificam migration runner, RLS forçado, unicidade case-insensitive, checksum SHA-256 fail-closed, separação `DATABASE_MIGRATION_URL`, CLI `migrate`, migration 002 que introduz `subscriptions`, `webhook_events` e `audit_logs` com `FORCE RLS`, e três repositories tipados (`subscription-repository`, `webhook-event-repository`, `audit-log-repository`) com isolamento cross-tenant sob `NOSUPERUSER NOBYPASSRLS`;
- o helper `requireMigrationDatabaseUrl` rejeita `DATABASE_MIGRATION_URL` vazia, ausente ou só com whitespace, devolve o valor após `trim` (sem truncar conteúdo interno) e nunca expõe connection strings em mensagens de erro;
- o CLI `migrate` exige `DATABASE_MIGRATION_URL`, faz `pool.end()` em caso de falha e sai com código `1` sem leak para stdout/stderr;
- provisioning com role runtime sob `FORCE RLS` passou;
- rollback tenant+owner passou;
- seis migration runners concorrentes foram serializados numa base vazia;
- a falha do próprio `ROLLBACK` destrói a ligação e preserva ambos os erros;
- a unicidade de email foi validada dentro do tenant e entre tenants;
- typecheck passou;
- nenhum container `beauty-saas-db-test-*` ficou residual.

## Gates ainda abertos

O package **não está pronto para produção** enquanto faltarem:

- processador idempotente de webhooks em transacção que usa os repositories `recordWebhookEvent` / `markWebhookProcessed` numa única transacção;
- primeiro agendamento end-to-end: signup → tenant persistido → trial/checkout → webhook idempotente → tenant activado → primeiro agendamento.

O estado e a sequência de execução são mantidos em [`../../docs/PHASE-1-EXECUTION.md`](../../docs/PHASE-1-EXECUTION.md).

## Regras de segurança

- Nunca ligar este package ao browser.
- Nunca usar valores fornecidos pelo cliente como identidade autenticada do tenant.
- Definir `app.tenant_id` numa transacção e nunca numa sessão persistente do pool.
- Manter `FORCE ROW LEVEL SECURITY` nas tabelas tenant-scoped.
- Não resolver falhas RLS com `BYPASSRLS`, superuser ou policies globais permissivas.
- Não devolver hashes de palavra-passe em responses, logs ou DTOs públicos.
- Usar apenas queries parametrizadas para dados.

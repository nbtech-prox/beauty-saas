# Changelog

Todas as alterações notáveis a este projecto são documentadas aqui.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-PT/1.1.0/),
e este projecto adere ao [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Por publicar]

> **Estado da entrega**: Fase 1 em progresso
>
> **Última actualização**: 2026-08-15

### Adicionado

- Estrutura monorepo (`apps/` + `packages/`)
- Documento de arquitectura (`docs/ARCHITECTURE.md`)
- 4 ADRs iniciais (subdomínios, schema partilhado, Stripe, RLS)
- Stubs para `landing`, `tenant-onboarding` e `tenancy-core`
- Config Traefik wildcard para `*.beauty.nbtech.pt`
- `.env.example` com variáveis necessárias
- Script `infra/scripts/setup.sh`
- Schemas Zod e tipos partilhados em `packages/contracts`
- Cliente HTTP tipado em `packages/api-client`, com módulos de autenticação e domínio operacional
- Wrapper Stripe em `packages/billing`: catálogo, clientes Stripe, subscrições, checkout, portal, verificação/encaminhamento de webhooks e quotas
- Protótipo de billing em `apps/platform-admin`: catálogo de planos, checkout, portal e endpoint de webhook
- Tracker operacional da Fase 1 com critérios, gates e evidências em `docs/PHASE-1-EXECUTION.md`
- Fundação PostgreSQL server-only em `packages/database`, com migrations SQL, repository transaccional e testes num PostgreSQL descartável
- ADR-005 para identidade de planos por código canónico
- ADR-006 para separação de roles PostgreSQL e operações privilegiadas mínimas

### Alterado

- Documentação de estado e roadmap sincronizada com a Fase 0 concluída e a Fase 1 em progresso
- Estados dos componentes classificados como concluído, parcial ou pendente, sem antecipar a conclusão dos fluxos de checkout e webhook

### Descontinuado

### Removido

### Corrigido

- Contrato do identificador do plano entre o detalhe público e o Checkout
- Resolução de códigos promocionais humanos para Promotion Codes antes de criar a Checkout Session
- Pesquisa de subscrições por tenant sem misturar operadores `AND` e `OR` incompatíveis na Stripe Search Query Language
- Validação UUID do tenant antes de Stripe Search e na API route do Checkout
- Lookup de Customer Stripe por `customers.list` paginado, compatível com UUIDs de 36 caracteres
- Página de retorno do Checkout com estado neutro e tratamento explícito de `session_id` ausente
- Contratos de Tenant e Subscription alinhados em `planCode`, validado por `PlanCodeSchema`
- Route de webhook com sequência `secret → assinatura → Zod → dispatch`, erros públicos genéricos e logs por allowlist
- Migration runner serializado por advisory lock, incluindo cleanup destrutivo se o `ROLLBACK` falhar
- Checksums SHA-256 de migrations com detecção de divergências e adopção legada explícita e fail-closed
- Unicidade case-insensitive de email por tenant, sem impedir reutilização entre tenants
- Reconciliação de subscrições entre `planCode`, `stripePriceId` devolvido pela Stripe e metadata fail-closed, com `inferPlanFromSubscription` a tipar `missing_plan_code`/`invalid_plan_code`/`unknown_plan_code`/`unknown_price_id`/`price_plan_mismatch`/`plan_code_mismatch` e sem fallback silencioso
- Paginação manual do `subscriptions.search` por `next_page` com detecção de cursor repetido via `SubscriptionPaginationError`
- Mapeamento do estado `incomplete_expired` para `canceled` para manter o enum do domínio fechado
- Resolução de `couponCode` em `subscriptions.ts` delegada para `promotion-codes.ts:resolvePromotionCodeId` (HTTP 400 dedicado)
- Migration `002_subscriptions_webhook_events_audit.sql` com três tabelas tenant-scoped (`subscriptions`, `webhook_events`, `audit_logs`), todas com `ENABLE` + `FORCE ROW LEVEL SECURITY` e policies fail-closed baseadas em `app.tenant_id`; `UNIQUE (provider, event_id)` e `UNIQUE (external_id)` são as chaves de idempotência
- Repositories tipados em TypeScript (`subscription-repository`, `webhook-event-repository`, `audit-log-repository`) com isolamento cross-tenant provado sob role `NOSUPERUSER NOBYPASSRLS` em `tests/rls-isolation.test.ts`
- Suite real PostgreSQL 17 descartável configurada em contentor `beauty-test-db` (`127.0.0.1:5433`, DB `beauty_saas_test`); vitest usa `pool: 'forks'`, `singleFork: true` e hookTime 30s para serializar os ficheiros de teste contra a base partilhada
- `apps/landing` (Marco 7) com Next 16.2.9, Tailwind v4, três páginas (`/`, `/precos`, `/planos/[code]`), `PricingCard` e helpers `formatPriceEUR`/`formatPlanInterval` em `lib/plans.ts`. Suite 16/16 verde; placeholder para o CTA final de onboarding
- `packages/tenancy-core` (Marco 6) com `resolveTenantBySlug(slug, options)` e `TenantResolutionCache` TTL 60s; `fetchImpl` e `AbortSignal.timeout(2500)` injectáveis; URL configurável via `JOYCE_RESOLVE_URL`; suite 15/15 verde (`cache.test.ts` 8 + `resolve.test.ts` 7)
- Marco 3 (webhook idempotente transaccional) em `apps/platform-admin` com `getPool()` lazy singleton + `processStripeWebhook(pool, event, dispatchKind)` em transacção explícita `BEGIN/COMMIT/ROLLBACK`; idempotência via `UNIQUE (provider, event_id)`; marshalha `recordWebhookEvent` → dispatch por `kind` → `upsertSubscription` + UPDATE `tenants.status` + `recordAuditLog` → `markWebhookProcessed`. Em erro: `ROLLBACK` + `markWebhookFailed` separado. Suite 12/12 verde (5 mockados + 2 persistência contra Postgres real).
- Novo tipo `QueryExecutor = Pool | PoolClient` em `packages/database/src/executor.ts` para que os repositórios aceitem ambos os modos (transacção curta vs transacção longa).
- `apps/tenant-onboarding` (Marco 4 + 5) com sessão HMAC-SHA256 Node + Web Crypto para Edge, password PBKDF2-SHA512 100k iters, rate-limit 5/60s, lazy pg.Pool; wizard `/registar` → `/salon` → `/plan` → `/ativado`; rotas `/api/auth/register`, `/salon`, `/checkout`. Suite 50/50 verde.

### Segurança

- Provisioning tenant+owner validado com role PostgreSQL `NOSUPERUSER` e `NOBYPASSRLS`, mantendo `FORCE ROW LEVEL SECURITY`
- Resultado público do repository sem exposição de `passwordHash`
- CLI de migrations separado da credencial runtime: exige `DATABASE_MIGRATION_URL` sem fallback para `DATABASE_URL`

[Por publicar]: https://github.com/nbtech-prox/beauty-saas

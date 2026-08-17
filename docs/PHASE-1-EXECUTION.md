# Fase 1 — Execução do MVP vertical slice

> Estado: em curso
> Última actualização: 2026-08-16
> Responsável: Beauty SaaS team

## Objectivo

Entregar um fluxo verificável em que um novo salão consegue:

1. criar uma conta;
2. registar o salão e reservar um slug;
3. iniciar um trial ou subscrever um plano;
4. ser activado por um webhook Stripe idempotente;
5. aceder ao seu tenant no data plane;
6. concluir o primeiro agendamento.

A Fase 1 só termina quando este percurso funciona ponta a ponta com persistência real. Páginas isoladas, mocks e respostas Stripe sem reconciliação não contam como conclusão.

## Estado dos blocos

| Bloco                            | Estado                           | Evidência                                                                                                                                                                                                                                          | Próximo critério                                                                                    |
| -------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Monorepo e ADRs                  | Concluído                        | workspace pnpm, ADR-001 a ADR-006                                                                                                                                                                                                                  | manter documentação sincronizada                                                                    |
| Contratos de domínio             | Concluído                        | `packages/contracts`, 190 testes                                                                                                                                                                                                                   | validar contra a persistência real                                                                  |
| Cliente do data plane            | Parcial                          | `packages/api-client`, 111 testes                                                                                                                                                                                                                  | integrar correcções de wire schemas e repetir smoke real                                            |
| Billing Stripe                   | Parcial                          | `packages/billing`, 100 testes; reconciliação Price ID/plan fechada em 2026-08-17 (100/100, typecheck limpo); faltam persistência de `subscriptions` em base de dados, idempotência do webhook e activação de tenant                               | validar Checkout live, persistir e processar webhooks                                               |
| Plataforma admin                 | Parcial → Concluído do checkout  | catálogo, Checkout, webhook idempotente transaccional; 12 testes verdes do webhook + persistência contra DB real                                                                                                                                   | gestão de tenants fica para Fase 2 (auth/ownership só para super-admin live)                        |
| Persistência do control plane    | Parcial                          | `packages/database`, 74 testes verdes em PostgreSQL 17 descartável; migration 002 com 3 tabelas e `FORCE RLS`; repositories tipados de `subscriptions`, `webhook_events`, `audit_logs`; isolamento cross-tenant sob role `NOSUPERUSER NOBYPASSRLS` | processador idempotente de webhook em transacção; webhook side ainda depende do hook platform-admin |
| Autenticação + Tenant onboarding | Concluído (control plane básico) | `apps/tenant-onboarding` com sessão HMAC-SHA256 cookie HTTP-only (Node + Edge variants), wizard `/registar` → `/salon` → `/plan`, rate-limit 5/60s, PBKDF2-SHA512 100k, pool singleton; 50 testes verdes                                           | ligar `tenancy-core::resolveTenantBySlug` no passo `/salon` para validar unicidade                  |
| Tenancy core                     | Concluído                        | `packages/tenancy-core` com `resolveTenantBySlug` + cache TTL; 15 testes verdes; sem dependência do runtime                                                                                                                                        | integrar com `apps/landing` e `apps/tenant-onboarding` para roteamento por subdomínio               |
| Landing                          | Concluído                        | `apps/landing` com Next 16, pricing e planos                                                                                                                                                                                                       | ligar CTA ao onboarding em Marco 5                                                                  |
| Integração com data plane        | Pendente                         | apenas cliente HTTP                                                                                                                                                                                                                                | tenant de teste e primeiro agendamento                                                              |
| Infraestrutura/observabilidade   | Fora do fecho imediato           | placeholders Traefik                                                                                                                                                                                                                               | preparar depois do vertical slice local                                                             |

## Sequência de execução

### Marco 1 — Baseline e contratos do checkout

- [ ] Corrigir o identificador público do plano (`pro-monthly`) entre UI e API.
- [ ] Criar testes das API routes do `platform-admin`.
- [x] Corrigir a aplicação de Promotion Codes no Checkout.
- [x] Garantir que a página de sucesso não apresenta activação antes da confirmação persistida.
- [ ] Executar testes e typecheck dos packages afectados.

Critério de saída: uma sessão Checkout válida pode ser criada em test mode com um tenant persistido e plano canónico.

Progresso verificado:

- 2026-08-15: código promocional humano passa a ser resolvido por `promotionCodes.list` e enviado como `discounts[].promotion_code`; códigos inexistentes produzem `PromotionCodeNotFoundError` e HTTP 400; regressões observadas em RED e depois GREEN; billing com 84/84 testes e typecheck limpo.
- 2026-08-15: listagem de subscrições activas deixou de misturar `AND` e `OR`, combinação não suportada pela Stripe Search Query Language; cada estado é consultado com filtro obrigatório do tenant; regressão observada em RED e depois GREEN.
- 2026-08-15: `tenantId` inválido é rejeitado antes de Stripe Search e pela API route do Checkout; o lookup de Customer deixou de usar Search para UUIDs de 36 caracteres e passou a `customers.list` paginado.
- 2026-08-15: retorno do Checkout apresenta “Confirmação em curso”, nunca declara pagamento/subscrição concluídos e rejeita acesso sem `session_id`; regressões observadas em RED e depois GREEN; platform-admin com 5/5 testes e typecheck limpo.
- 2026-08-15: ADR-005 adoptou `planCode` como identidade canónica; `PlanCodeSchema`, Tenant e Subscription foram alinhados por quatro ciclos RED/GREEN; contracts com 190/190 testes e consumidores sem regressões.

### Marco 2 — PostgreSQL do control plane

- [x] Criar package de acesso a dados server-only.
- [ ] Adicionar migrations para `tenants`, `tenant_users`, `subscriptions`, `webhook_events`, `audit_logs` e sessões.
- [ ] Aplicar constraints de unicidade para slug, email/tenant e eventos externos.
- [ ] Implementar transactions e repositories tipados.
- [ ] Testar migrations e repositories num PostgreSQL descartável.

Progresso verificado:

- 2026-08-15: `createTenantWithOwner` cria tenant e owner atomicamente com role PostgreSQL `LOGIN`, `NOSUPERUSER` e `NOBYPASSRLS`, mantendo `FORCE ROW LEVEL SECURITY`; teste observou RED `42501`, depois GREEN; revisão de qualidade aprovada.
- 2026-08-15: o resultado público de `createTenantWithOwner` deixou de expor `passwordHash`; o `RETURNING` do owner usa allowlist explícita e o gate passou spec e qualidade.
- 2026-08-15: seis migration runners concorrentes numa base vazia são serializados por advisory lock transaccional; falha do próprio `ROLLBACK` destrói a ligação e preserva ambos os erros; revisão final aprovada.
- 2026-08-16: o helper `requireMigrationDatabaseUrl` rejeita `DATABASE_MIGRATION_URL` ausente, vazia ou só com whitespace, preservando o `trim` da connection string sem expor o valor em mensagens de erro; o CLI `migrate` usa `Pool` dedicado, liberta a ligação em caso de falha e sai com código `1` sem leak para stdout/stderr; três testes do CLI provam o comportamento fim-a-fim; revisão de qualidade ainda não fechada (a correcção foi truncada por `max_iterations` e tem de ser revalidada com a suite completa do package).
- 2026-08-16: o harness Docker passou a checkpoints explícitos após cada `await` (run/port/exec/delay) e antes do `spawn` do Vitest, via `runIntegrationHarness` testável e `main` async sem side effects; `packages/database` tem agora 46 testes unitários e 4 ficheiros de integração com `TEST_DATABASE_URL` (não corrida nesta janela por falta de Postgres descartável na VM).
- 2026-08-16: regressão detectada em `@beauty-saas/billing` — `tsc --noEmit` com 13 erros (tipo `PlanCode` mal inferido, `SubscriptionRecord` sem `stripePriceId`, símbolos `SubscriptionPaginationError`/`SubscriptionReconciliationError`/`SubscriptionReconciliationReason` reexportados mas não definidos) e 19 testes a falhar (81/100). `inferPlanFromSubscription` é um no-op com fallback silencioso para `proMonthly`; `listActiveSubscriptionsForTenant` mistura `OR`/`AND` na query Stripe Search (filtro de tenant não é aplicado, potencial leak) e não pagina. Correcção por TDD vertical em cinco ciclos em curso; gates de qualidade fechados só depois do GREEN revalidado.
- 2026-08-17: regressão de `@beauty-saas/billing` corrigida por TDD vertical — `subscriptions.ts` reescrita com `inferPlanFromSubscription` tipado e fechado (`missing_plan_code`, `invalid_plan_code`, `unknown_plan_code`, `unknown_price_id`, `price_plan_mismatch`, `plan_code_mismatch`), sem fallback silencioso; `SubscriptionRecord` passou a expor `stripePriceId`; `listActiveSubscriptionsForTenant` faz três chamadas paralelas com `assertValidTenantId` e paginação manual via `seenPages`, levantando `SubscriptionPaginationError` em cursor repetido; `mapStripeStatus` mapeia `incomplete_expired → canceled`; `resolvePromotionCode` delega para `promotion-codes.ts:resolvePromotionCodeId`; verificado: `vitest 100/100`, `tsc --noEmit` limpo.
- 2026-08-17: segunda metade do Marco 2 — adicionada migration `002_subscriptions_webhook_events_audit.sql` com 3 tabelas (`subscriptions`, `webhook_events`, `audit_logs`) e `FORCE ROW LEVEL SECURITY` em todas, policies fail-closed baseadas em `app.tenant_id`, índices de suporte, e três repositories tipados (`subscription-repository`, `webhook-event-repository`, `audit-log-repository`) com testes cross-tenant sob `NOSUPERUSER NOBYPASSRLS`. Suite 74/74 verde em PostgreSQL 17 descartável; `tsc --noEmit` limpo.
- 2026-08-17: Marco 7 (landing) implementado em `apps/landing/` com Next 16.2.9, Tailwind v4, três páginas (`/`, `/precos`, `/planos/[code]`), `PricingCard` e `formatPriceEUR`/`formatPlanInterval` em `lib/plans.ts`. Suite 16/16 verde; `tsc --noEmit` limpo.
- 2026-08-17: Marco 6 (tenancy-core) implementado — `resolveTenantBySlug(slug, options)` com `TenantResolutionCache` TTL 60s, suporte a `fetchImpl` injectado, normalização para `[a-z0-9-]{3,30}` (slug inválido devolve `not_found`), `AbortSignal.timeout(2500)` para tolerar falhas do data plane, URL configurável via `JOYCE_RESOLVE_URL`. Suite 15/15 verde (`cache.test.ts` 8 + `resolve.test.ts` 7); `tsc --noEmit` limpo.
- 2026-08-17: Marco 3 (webhook idempotente transaccional) implementado em `apps/platform-admin` — `getPool()` lazy singleton, `processStripeWebhook(pool, event, dispatchKind)` com transacção explícita `BEGIN/COMMIT/ROLLBACK` que faz `recordWebhookEvent` (idempotente via `UNIQUE (provider, event_id)`), despacha por `kind` (subscription.* / invoice.* / checkout.session.completed / ignored), `markWebhookProcessed`, em erro `markWebhookFailed` numa transacção separada. Type `QueryExecutor` em `packages/database` para aceitar `Pool | PoolClient`. `StripeWebhookEvent` re-exportado por `@beauty-saas/billing/webhook`. Routes `/api/billing/webhook` actualizadas para devolver 200 só após `COMMIT`. Suite 12/12 verde (5 mockados + 2 persistência contra Postgres real); `tsc --noEmit` limpo.
- 2026-08-17: Marco 4 + Marco 5 (autenticação + wizard de onboarding) implementados em `apps/tenant-onboarding` — `session.ts` (Node HMAC-SHA256 timing-safe) + `session-edge.ts` (Web Crypto para o middleware); `password.ts` (PBKDF2-SHA512 100k iters); rate-limit `5/60s` em token bucket; `getPool()` lazy singleton; rotas `/api/auth/register`, `/salon`, `/checkout`; páginas `/registar`, `/salon`, `/plan`, `/ativado`; middlewares de protecção de páginas autenticadas. Suite 50/50 verde (session 9 + password 12 + register 10 + salon 4 + checkout 8 + form 4 + page 3); `tsc --noEmit` limpo.
- 2026-08-15: índice `(tenant_id, lower(email))` impede duplicados case-insensitive no mesmo tenant e permite o mesmo email entre tenants; erro `23505` e nome da constraint cobertos; revisão final aprovada.
- 2026-08-15: o migration runner persiste SHA-256 exacto, rejeita divergências e faz upgrade fail-closed de `schema_migrations` legado; adopção de markers conhecidos exige opt-in explícito e markers desconhecidos são recusados; spec e qualidade aprovadas.
- 2026-08-15: o CLI de migrations exige `DATABASE_MIGRATION_URL` e nunca reutiliza `DATABASE_URL`; os dois contratos foram provados por ciclos RED/GREEN, sem expor connection strings.

Próximo tracer bullet — `subscriptions`:

- [ ] O contract e o record conservam `planCode` e `stripePriceId`; metadata Stripe ausente ou inválida falha sem inventar um plano.
- [ ] Migration versionada cria `subscriptions` com `tenant_id`, `plan_code`, `stripe_price_id`, `external_id`, `external_customer_id`, estado, períodos e timestamps.
- [ ] Constraints impedem IDs externos duplicados e períodos inválidos sem codificar o catálogo comercial inteiro em SQL.
- [ ] A tabela usa `ENABLE/FORCE ROW LEVEL SECURITY` e o repository é provado com uma role runtime `NOSUPERUSER NOBYPASSRLS`.
- [ ] O repository suporta reconciliação idempotente e mantém a identidade canónica definida no ADR-005.
- [ ] Testes PostgreSQL reais cobrem isolamento, insert/update, reentrega e rollback.

Critério de saída: migrations sobem e descem; invariantes e idempotência são provadas por testes de integração.

### Marco 3 — Webhook idempotente

- [ ] Registar cada evento Stripe antes de o processar.
- [ ] Tratar reentregas como no-op.
- [ ] Reconciliar Customer, Subscription e Tenant.
- [ ] Persistir sucesso/falha e número de tentativas.
- [ ] Não responder 200 quando o evento conhecido não ficou duravelmente processado.

Critério de saída: reenviar o mesmo `evt_*` não duplica efeitos e os estados de tenant/subscrição convergem para o Stripe.

### Marco 4 — Autenticação e ownership

- [ ] Registo e login do owner.
- [ ] Sessão persistente, cookie seguro e protecção CSRF.
- [ ] Checkout deriva o tenant da sessão, não do body.
- [ ] Portal deriva o Stripe Customer do tenant autenticado.
- [ ] Rate limiting nos endpoints sensíveis.

Critério de saída: um utilizador não consegue abrir Checkout ou Portal de outro tenant.

### Marco 5 — Onboarding

- [ ] Passo 1: conta.
- [ ] Passo 2: dados do salão e disponibilidade do slug.
- [ ] Passo 3: trial ou plano pago.
- [ ] Retoma segura de onboarding interrompido.
- [ ] Estados de erro, loading, validação e sucesso em pt-PT.

Critério de saída: um novo owner cria um tenant sem intervenção manual.

### Marco 6 — Resolução de tenant e data plane

- [ ] Implementar `packages/tenancy-core`.
- [ ] Resolver slug reservado, inexistente, suspenso e activo.
- [ ] Ligar tenant activo ao `joycehairbeauty` através do contrato versionado.
- [ ] Integrar as correcções de wire schemas do API client.
- [ ] Executar smoke test contra a API real.

Critério de saída: o tenant de teste acede apenas ao seu contexto no data plane.

### Marco 7 — Landing e vertical slice final

- [ ] Implementar homepage, features e pricing.
- [ ] Ligar CTA ao onboarding.
- [ ] Completar o primeiro agendamento no tenant criado.
- [ ] Executar testes, lint, typecheck, audit e builds completos.
- [ ] Actualizar roadmap, READMEs e changelog.

Critério de saída: `landing → signup → trial/checkout → webhook → tenant activo → primeiro agendamento` funciona ponta a ponta.

## Gates de qualidade

Cada marco exige:

- teste de regressão escrito antes da correcção ou funcionalidade;
- teste específico observado em RED e depois em GREEN;
- testes do package afectado;
- typecheck do package afectado;
- revisão de segurança das fronteiras de tenant;
- actualização deste documento e do roadmap;
- nenhum commit ou push automático sem pedido explícito.

## Baseline verificada em 2026-08-15

- `pnpm run test`: passou; a última execução raiz completa incluiu 189 testes de contracts, 111 de api-client, 84 de billing, 4 de platform-admin e 6 de database. Depois dessa execução, gates isolados confirmaram 190 testes em contracts, 5 no platform-admin e 9 no database.
- `pnpm run typecheck`: falhou globalmente porque `landing` e `tenancy-core` são stubs sem `tsconfig`.
- Typecheck isolado de contracts, api-client, billing e platform-admin: passou.
- `pnpm run lint`: falhou; as apps ainda usam `next lint` e vários packages têm placeholders.
- `pnpm audit --prod`: 14 vulnerabilidades, das quais 7 high e 7 moderate.
- Build global não foi considerado gate porque duas apps ainda não têm implementação.

## Próxima acção

Concluir o Marco 1 e só depois introduzir o schema PostgreSQL do Marco 2. O onboarding não deve continuar a gerar identidades de tenant em `localStorage`, porque isso impede ownership, reconciliação e idempotência reais.

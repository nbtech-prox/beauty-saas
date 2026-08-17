# Arquitectura — Beauty SaaS

> **Estado**: Fase 0 concluída; Fase 1 em progresso
> **Última actualização**: 2026-08-15
> **Autor**: Beauty SaaS team
> **Audiência**: devs novos, contribuidores, auditoria técnica

---

## 1. Visão e objectivos

### 1.1 O que estamos a construir

Uma **plataforma SaaS** que permite a salões de beleza ter a sua própria instância da aplicação [`joycehairbeauty`](../joycehairbeauty) sem deploy próprio. Cada salão é um **tenant** — um cliente que paga uma subscrição mensal.

### 1.2 Objectivos de negócio

- **Time-to-value** para um novo salão: < 5 minutos (signup → primeiro agendamento)
- **Self-service**: 100% das operações (signup, billing, cancelamento) sem intervenção humana
- **Multi-tenant sem drama**: isolamento garantido por defeito, zero leaks
- **Margem saudável**: < 15% do revenue em infra

### 1.3 Não-objectivos (YAGNI explícito)

- ❌ White-label completo com CSS custom por tenant (fase 3+)
- ❌ Marketplace de plugins por tenant (fase 4+)
- ❌ Mobile app nativa (apenas web responsiva)
- ❌ Multi-região geográfica com data residency (considerar após 100 tenants)

---

## 2. Princípios arquitecturais

1. **Control plane ≠ data plane**. O SaaS nunca toca directamente na base de dados de produção. Tudo passa por API.
2. **Adicionar > reescrever**. Nunca migramos `joycehairbeauty` de uma vez; cada modelo ganha `tenant_id` incrementalmente com feature flag.
3. **Schema-first**. Antes de cada migration, escrevemos o ADR e revemos com a equipa.
4. **Falha visível**. Qualquer erro de isolamento de tenant explode em testes, não silenciosamente em produção.
5. **Idempotência em tudo**. Webhooks, jobs, signups — tudo idempotente por design.

---

## 3. Vista de sistema (C4 — nível 1)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                  INTERNET                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────────┐
        │                             │                                 │
        ▼                             ▼                                 ▼
┌──────────────────┐         ┌──────────────────┐            ┌──────────────────┐
│  *.beauty.nbtech.pt │         │ beauty.nbtech.pt    │            │  api.beauty.nbtech  │
│  (tenants)       │         │ (landing)        │            │  .pt (opcional)  │
└──────────────────┘         └──────────────────┘            └──────────────────┘
        │                             │                                 │
        └─────────────────────────────┼─────────────────────────────────┘
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │  Traefik (wildcard SSL) │
                         └─────────────────────────┘
                                      │
            ┌─────────────────────────┼─────────────────────────┐
            │                         │                         │
            ▼                         ▼                         ▼
   ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────────┐
   │ Tenant Frontend │      │ Platform Admin  │      │ Tenant Onboarding   │
   │ (proxy → JHB)   │      │ (beauty-saas)    │      │ (beauty-saas)        │
   └─────────────────┘      └─────────────────┘      └─────────────────────┘
            │                         │                         │
            │                         └──────────┬──────────────┘
            │                                    │
            │ HTTP (Sanctum token)               ▼
            │                         ┌─────────────────────┐
            │                         │  Stripe Webhooks    │
            │                         │  Resend (email)     │
            │                         │  Sentry (errors)    │
            │                         └─────────────────────┘
            ▼
   ┌─────────────────────────────────────────────────┐
   │              joycehairbeauty (data plane)       │
   │  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
   │  │ apps/web │  │ apps/api │  │ PostgreSQL   │   │
   │  │ (Next)   │  │ (Laravel)│  │ + Redis      │   │
   │  └──────────┘  └──────────┘  └──────────────┘   │
   └─────────────────────────────────────────────────┘
```

---

## 4. Modelo de domínio

### 4.1 Entidades principais

| Entidade                                 | Onde vive         | Razão                              |
| ---------------------------------------- | ----------------- | ---------------------------------- |
| `Tenant`                                 | `beauty-saas`     | SaaS é dono da relação comercial   |
| `Plan`                                   | `beauty-saas`     | Pricing é definido pela plataforma |
| `Subscription`                           | `beauty-saas`     | Lifecycle de pagamento             |
| `TenantUser`                             | `beauty-saas`     | RBAC ao nível do tenant            |
| `User` (cliente final)                   | `joycehairbeauty` | Já existe, ganha `tenant_id`       |
| `Service`, `Professional`, `Appointment` | `joycehairbeauty` | Já existem, ganham `tenant_id`     |
| `AuditLog`                               | `beauty-saas`     | Visível só ao platform admin       |
| `WebhookEvent`                           | `beauty-saas`     | Idempotência de webhooks Stripe    |

### 4.2 Modelo de tenancy

**Estratégia escolhida**: **Shared DB, shared schema com `tenant_id`** + Postgres Row-Level Security (RLS).

**Razões**:

- ✅ Suficiente até ~5.000 tenants (largamente acima do nosso target de 24 meses)
- ✅ Backups, migrations e analytics são triviais (uma única DB)
- ✅ RLS do Postgres dá isolamento ao nível da DB (defesa em profundidade)
- ✅ Custo de infra previsível

**Alternativas rejeitadas**:

- ❌ DB-per-tenant: operacionalmente caro (100+ DBs para gerir)
- ❌ Schema-per-tenant: Postgres suporta mas migrations ficam complexas
- ❌ Discriminator column sem RLS: propenso a bugs "onde falta o `where(tenant_id)`"

### 4.3 Isolamento: 3 camadas

1. **Camada 1 — Aplicação**: middleware `IdentifyTenant` em **todos** os requests do `joycehairbeauty`. Lê `X-Tenant-Slug` (enviado pelo Traefik a partir do subdomínio) e popula `app('current_tenant')`. Global Scope do Eloquent adiciona `where tenant_id = current` automaticamente.
2. **Camada 2 — ORM**: Policies do Laravel verificam `tenant_id` em todas as operações. Testes Pest garantem cobertura 100%.
3. **Camada 3 — DB**: RLS no Postgres força `tenant_id = current_setting('app.tenant_id')` em cada SELECT/INSERT/UPDATE/DELETE. Mesmo um bug na camada 1 é contido.

---

## 5. Identificação de tenant

### Fluxo

```
Cliente digita joyce.beauty.nbtech.pt
        │
        ▼
Traefik resolve *.beauty.nbtech.pt → mesmo container
        │
        ▼
Traefik injecta header: X-Tenant-Slug: joyce
        │
        ▼
joycehairbeauty/apps/api: middleware IdentifyTenant
        │
        ├─ Lookup em Redis: tenant_by_slug["joyce"]
        │
        ├─ Cache miss → SELECT * FROM tenants WHERE slug = 'joyce'
        │
        ├─ SET app('current_tenant', $tenant)
        │
        └─ SET Postgres: SET LOCAL app.tenant_id = '<uuid>'
                │
                ▼
        Eloquent Global Scope + RLS filtram automaticamente
```

### Edge cases

- **Subdomínio inválido** (`foo.beauty.nbtech.pt` que não existe) → 404 com página de "Salão não encontrado"
- **Tenant suspenso** → 402 Payment Required com CTA "Actualizar pagamento"
- **Tenant em trial expirado** → 403 com CTA "Iniciar subscrição"
- **Subdomínio reservado** (`www`, `api`, `admin`, `app`) → routing interno, nunca chega ao middleware

---

## 6. Billing

> **Estado de implementação**: parcial. `packages/billing` implementa as primitivas Stripe e `apps/platform-admin` disponibiliza um protótipo de integração. Checkout real de ponta a ponta, persistência idempotente de eventos e efeitos de negócio dos webhooks continuam pendentes.

### Processador

**Stripe** (não Paddle). Razões:

- Customer Portal pronto a usar
- Webhooks robustos e bem documentados
- Suporte a múltiplas moedas, impostos (Stripe Tax)
- Invoice template customizável
- Pricing tiers documentados em código (não dashboard)

### Catálogo actualmente codificado

| Plano          | Mensal |  Anual | Profissionais | Agendamentos/mês |
| -------------- | -----: | -----: | ------------: | ---------------: |
| **Starter**    |    19€ |   190€ |             3 |              500 |
| **Pro**        |    49€ |   490€ |            10 |            2.000 |
| **Enterprise** |   199€ | 1.990€ |           100 |           20.000 |

Os Price IDs são configurados por variáveis de ambiente. O trial é parametrizável no checkout; não existe ainda um fluxo funcional de plano gratuito no onboarding.

### Webhooks (objectivo arquitectural)

| Evento                          | Acção                                               |
| ------------------------------- | --------------------------------------------------- |
| `customer.subscription.created` | Activar tenant, enviar email de boas-vindas         |
| `customer.subscription.updated` | Sincronizar plano e limites                         |
| `customer.subscription.deleted` | Marcar tenant como `canceled` (grace period 7 dias) |
| `invoice.payment_failed`        | Marcar `past_due`, enviar email + banner in-app     |
| `invoice.paid`                  | Reactivar tenant se estava `past_due`               |

**Idempotência pretendida**: cada webhook será registado em `webhook_events(stripe_event_id UNIQUE, payload, processed_at)`. Reentregas deverão ser no-op. Actualmente, o protótipo verifica a assinatura, classifica o evento, regista-o no log e responde com ACK, mas ainda não persiste o evento nem aplica as acções da tabela.

---

## 7. Multi-region e performance

### Objectivos

- **p95 TTFB** para tenant page: < 200ms (na região do tenant)
- **p99** erro rate: < 0.1%

### Fase 1 (MVP)

- Single region (Dokploy actual, EU)
- Postgres self-hosted
- Redis para cache e filas
- CDN para assets estáticos (Cloudflare Free tier)

### Fase 2 (escala)

- Read replicas do Postgres
- Cache agressivo com TTL por tenant
- Stripe webhook → fila assíncrona

### Fase 3 (global)

- Multi-region EU/BR/US com data residency opcional
- Postgres read replicas por região

---

## 8. Segurança

| Risco                              | Mitigação                                                        |
| ---------------------------------- | ---------------------------------------------------------------- |
| Tenant A acede a dados de Tenant B | RLS + Global Scopes + testes de penetração                       |
| Subdomínio takeover                | Validação de CNAME + verificação periódica                       |
| Webhook spoofing                   | Validação de signature Stripe (`stripe.webhooks.constructEvent`) |
| Session hijacking                  | Sanctum SPA + SameSite=Lax + CSRF token                          |
| Brute-force login                  | Rate limit por IP + por tenant (Laravel throttle)                |
| SQL injection                      | Eloquent + prepared statements (já existente)                    |
| Secrets leak                       | `.env` nunca comitado + GitHub secret scanning                   |

### Compliance

- **LGPD/GDPR**: endpoint `DELETE /api/tenants/{id}/gdpr-erase` apaga **todos os dados** do tenant (cascade). Log em `audit_logs`.
- **Right to export**: `GET /api/tenants/{id}/export` devolve JSON com todos os dados.
- **Audit log**: cada acção de platform-admin é registada com actor, IP, before/after.

---

## 9. Observabilidade

| Sinal              | Ferramenta                                                          |
| ------------------ | ------------------------------------------------------------------- |
| Errors             | Sentry (free tier 5k events/mês)                                    |
| Logs               | Papertrail ou Logtail (centralizado)                                |
| Metrics            | Prometheus + Grafana (self-hosted)                                  |
| Uptime             | Uptime Kuma (self-hosted) ou Betterstack                            |
| Webhook monitoring | Stripe Dashboard + alert em `webhook_events` não processados > 5min |

---

## 10. Roadmap faseado

### Legenda

- **Concluído** — implementação disponível e critério desta etapa verificável.
- **Parcial** — existe implementação útil, mas faltam integrações ou validação de ponta a ponta.
- **Pendente** — ainda não existe implementação funcional para a etapa.

### Fase 0 — Bootstrap — **Concluído**

- [x] Estrutura monorepo
- [x] ADRs iniciais
- [x] Documentação arquitectural
- [x] `package.json` workspace

### Fase 1 — MVP vertical slice — **Em progresso**

O estado executável, a sequência técnica e as evidências de cada incremento são
mantidos em [`PHASE-1-EXECUTION.md`](./PHASE-1-EXECUTION.md). Este roadmap define
o âmbito; o tracker só marca itens concluídos depois dos respectivos gates.

- **Parcial** — `packages/contracts`: schemas e tipos do domínio actualmente mapeado, com testes automatizados; faltam validações com mais payloads reais.
- **Parcial** — `packages/api-client`: transporte, validação, autenticação e módulos operacionais implementados; quatro divergências no formato de transporte continuam documentadas no README do package.
- **Parcial** — `packages/billing`: wrapper Stripe, catálogo, clientes Stripe, subscrições, checkout, portal, verificação/encaminhamento de webhooks e quotas implementados e testados ao nível da biblioteca.
- **Parcial** — `apps/platform-admin`: protótipo de billing com catálogo, checkout, portal e recepção de webhooks. É suporte à Fase 1, não a conclusão da Fase 2.
- [ ] **Pendente** — `apps/landing` com página de pricing funcional.
- [ ] **Pendente** — `apps/tenant-onboarding` com assistente de registo.
- [ ] **Pendente** — `packages/tenancy-core` com identificação e resolução de tenant.
- [ ] **Pendente** — persistência idempotente dos eventos Stripe e aplicação dos efeitos de negócio.
- [ ] **Pendente** — onboarding de um tenant de teste (Joyce) e primeiro agendamento.

#### Critérios verificáveis para concluir a Fase 1

1. `pnpm test` termina com sucesso para os workspaces com testes; stubs sem testes não contam como cobertura funcional.
2. `pnpm typecheck` termina com sucesso em todos os workspaces, incluindo os stubs, sem depender da apresentação da ajuda do compilador.
3. O teste rápido do `api-client` valida todos os endpoints seleccionados contra a API real, sem divergências no formato de transporte por resolver.
4. A landing apresenta pricing funcional e encaminha o CTA para o onboarding.
5. O onboarding cria conta e salão, valida um slug disponível e inicia um período experimental ou o Checkout Stripe.
6. Uma Checkout Session de teste é concluída e o retorno é associado ao tenant correcto; criar uma sessão isolada não satisfaz este critério.
7. Um webhook Stripe com assinatura válida é persistido de forma idempotente, processado uma única vez e actualiza o estado da subscrição; o ACK e o log do protótipo não satisfazem este critério.
8. Um tenant de teste percorre registo → período experimental/checkout → activação → primeiro agendamento sem intervenção manual fora do fluxo documentado.

**Definição de pronto**: os oito critérios anteriores têm evidência reproduzível. À data desta actualização, o fluxo checkout/webhook e o vertical slice completo permanecem por validar.

### Fase 2 — Platform admin — **Pendente (com protótipo de billing)**

- **Parcial** — protótipo de billing: catálogo, checkout, portal e endpoint de webhook
- [ ] `apps/platform-admin` com lista de tenants, MRR, churn
- [ ] Impersonar tenant (com audit log)
- [ ] Suspender/reativar tenant manualmente
- [ ] Métricas básicas em Grafana

### Fase 3 — Tenancy incremental em joycehairbeauty — **Pendente**

- [ ] Adicionar `tenant_id` em `gallery_items`, `testimonials`, `faqs` (baixo risco)
- [ ] Adicionar `tenant_id` em `services`, `service_categories`, `professionals`
- [ ] Adicionar `tenant_id` em `business_hours`, `appointments`, `users`
- [ ] RLS policies em todas as tabelas
- [ ] Testes de isolamento (Pest) com 100% cobertura de policies

### Fase 4 — Operação a sério — **Pendente**

- [ ] Traefik wildcard + Let's Encrypt DNS-01
- [ ] Sentry + Logtail + Uptime Kuma
- [ ] Runbooks para incidentes comuns
- [ ] On-call rotation (mesmo que seja só tu)

### Fase 5 — Crescimento — **Pendente**

- [ ] Email marketing (Resend sequences)
- [ ] Affiliate program
- [ ] Status page pública
- [ ] Blog/SEO

---

## 11. Riscos abertos

| Risco                                          | Probabilidade | Impacto | Mitigação                                                     |
| ---------------------------------------------- | ------------- | ------- | ------------------------------------------------------------- |
| Multi-tenancy no joycehairbeauty introduz bugs | Média         | Alto    | Feature flags + canary deploy + suite de testes de isolamento |
| Stripe webhook delivery flaky                  | Baixa         | Médio   | Idempotência + retry exponencial + alerta                     |
| Cliente queira cancelar no dia 1 do trial      | Média         | Baixo   | Aceitar; recolher feedback por email                          |
| Custo de infra > 30% do revenue                | Baixa         | Alto    | Monitorizar, ajustar pricing se necessário                    |
| Competidor (Fresha, Treatwell) entra em PT     | Média         | Alto    | Foco em UX + personalização; parcerias locais                 |

---

## 12. Como contribuir

1. Ler este documento e os ADRs em `docs/adr/`
2. Criar branch `feature/<slug>`
3. PR com testes + screenshot/GIF se for UI
4. 2 aprovações (ou 1 se for trivial)
5. Squash merge para `develop` → depois `main`

---

## Anexos

- [ADR-001: Subdomínios wildcard vs path prefix](./adr/ADR-001-subdominios-vs-path.md)
- [ADR-002: Shared schema vs schema-per-tenant](./adr/ADR-002-shared-schema-vs-schema-per-tenant.md)
- [ADR-003: Stripe vs Paddle](./adr/ADR-003-stripe-vs-paddle.md)
- [ADR-004: RLS como camada de defesa](./adr/ADR-004-rls-como-defesa-em-profundidade.md)
- [ADR-005: Identidade de planos por código canónico](./adr/ADR-005-identidade-de-planos.md)
- [ADR-006: Fronteiras de privilégios PostgreSQL](./adr/ADR-006-fronteiras-de-privilegios-postgresql.md)

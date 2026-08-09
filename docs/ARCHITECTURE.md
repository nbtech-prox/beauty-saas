# Arquitectura — Beauty SaaS

> **Estado**: 🚧 Draft v0.1 — pré-implementação
> **Última actualização**: 2026-08-09
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

| Entidade | Onde vive | Razão |
|---|---|---|
| `Tenant` | `beauty-saas` | SaaS é dono da relação comercial |
| `Plan` | `beauty-saas` | Pricing é definido pela plataforma |
| `Subscription` | `beauty-saas` | Lifecycle de pagamento |
| `TenantUser` | `beauty-saas` | RBAC ao nível do tenant |
| `User` (cliente final) | `joycehairbeauty` | Já existe, ganha `tenant_id` |
| `Service`, `Professional`, `Appointment` | `joycehairbeauty` | Já existem, ganham `tenant_id` |
| `AuditLog` | `beauty-saas` | Visível só ao platform admin |
| `WebhookEvent` | `beauty-saas` | Idempotência de webhooks Stripe |

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

### Processador

**Stripe** (não Paddle). Razões:
- Customer Portal pronto a usar
- Webhooks robustos e bem documentados
- Suporte a múltiplas moedas, impostos (Stripe Tax)
- Invoice template customizável
- Pricing tiers documentados em código (não dashboard)

### Planos (proposta inicial)

| Plano | Preço/mês | Profissionais | Agendamentos/mês | Storage | Suporte |
|---|---|---|---|---|---|
| **Free** (trial 14 dias) | 0€ | 1 | 50 | 100 MB | Email |
| **Starter** | 29€ | 3 | 500 | 1 GB | Email |
| **Pro** | 79€ | 10 | 2.000 | 5 GB | Email + chat |
| **Business** | 199€ | Ilimitado | Ilimitado | 50 GB | Prioritário |

(Valores são placeholders — confirmar com o utilizador antes de fixar.)

### Webhooks (idempotentes)

| Evento | Acção |
|---|---|
| `customer.subscription.created` | Activar tenant, enviar email de boas-vindas |
| `customer.subscription.updated` | Sincronizar plano e limites |
| `customer.subscription.deleted` | Marcar tenant como `canceled` (grace period 7 dias) |
| `invoice.payment_failed` | Marcar `past_due`, enviar email + banner in-app |
| `invoice.paid` | Reactivar tenant se estava `past_due` |

**Idempotência**: cada webhook é registado em `webhook_events(stripe_event_id UNIQUE, payload, processed_at)`. Reentregas são no-op.

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

| Risco | Mitigação |
|---|---|
| Tenant A acede a dados de Tenant B | RLS + Global Scopes + testes de penetração |
| Subdomínio takeover | Validação de CNAME + verificação periódica |
| Webhook spoofing | Validação de signature Stripe (`stripe.webhooks.constructEvent`) |
| Session hijacking | Sanctum SPA + SameSite=Lax + CSRF token |
| Brute-force login | Rate limit por IP + por tenant (Laravel throttle) |
| SQL injection | Eloquent + prepared statements (já existente) |
| Secrets leak | `.env` nunca comitado + GitHub secret scanning |

### Compliance

- **LGPD/GDPR**: endpoint `DELETE /api/tenants/{id}/gdpr-erase` apaga **todos os dados** do tenant (cascade). Log em `audit_logs`.
- **Right to export**: `GET /api/tenants/{id}/export` devolve JSON com todos os dados.
- **Audit log**: cada acção de platform-admin é registada com actor, IP, before/after.

---

## 9. Observabilidade

| Sinal | Ferramenta |
|---|---|
| Errors | Sentry (free tier 5k events/mês) |
| Logs | Papertrail ou Logtail (centralizado) |
| Metrics | Prometheus + Grafana (self-hosted) |
| Uptime | Uptime Kuma (self-hosted) ou Betterstack |
| Webhook monitoring | Stripe Dashboard + alert em `webhook_events` não processados > 5min |

---

## 10. Roadmap faseado

### Fase 0 — Bootstrap (agora) ✅

- Estrutura monorepo
- ADRs iniciais
- Documentação arquitectural
- `package.json` workspace

### Fase 1 — MVP vertical slice (2-3 semanas)

- [ ] `packages/api-client` com 5 endpoints (auth, tenants, plans, subscriptions, services)
- [ ] `apps/landing` com página de pricing funcional
- [ ] `apps/tenant-onboarding` com wizard de signup
- [ ] `packages/billing` com Stripe wrapper + webhook receiver
- [ ] 1 tenant de teste (Joyce) onboarded manualmente
- **Definição de pronto**: 1 novo salão consegue signup → trial → primeiro agendamento end-to-end

### Fase 2 — Platform admin (2-3 semanas)

- [ ] `apps/platform-admin` com lista de tenants, MRR, churn
- [ ] Impersonar tenant (com audit log)
- [ ] Suspender/reativar tenant manualmente
- [ ] Métricas básicas em Grafana

### Fase 3 — Tenancy incremental em joycehairbeauty (4-6 semanas)

- [ ] Adicionar `tenant_id` em `gallery_items`, `testimonials`, `faqs` (baixo risco)
- [ ] Adicionar `tenant_id` em `services`, `service_categories`, `professionals`
- [ ] Adicionar `tenant_id` em `business_hours`, `appointments`, `users`
- [ ] RLS policies em todas as tabelas
- [ ] Testes de isolamento (Pest) com 100% cobertura de policies

### Fase 4 — Operação a sério (2-3 semanas)

- [ ] Traefik wildcard + Let's Encrypt DNS-01
- [ ] Sentry + Logtail + Uptime Kuma
- [ ] Runbooks para incidentes comuns
- [ ] On-call rotation (mesmo que seja só tu)

### Fase 5 — Growth (contínuo)

- [ ] Email marketing (Resend sequences)
- [ ] Affiliate program
- [ ] Status page pública
- [ ] Blog/SEO

---

## 11. Riscos abertos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Multi-tenancy no joycehairbeauty introduz bugs | Média | Alto | Feature flags + canary deploy + suite de testes de isolamento |
| Stripe webhook delivery flaky | Baixa | Médio | Idempotência + retry exponencial + alerta |
| Customer queira cancelar no dia 1 do trial | Média | Baixo | Aceitar; email收集 feedback |
| Custo de infra > 30% do revenue | Baixa | Alto | Monitorizar, ajustar pricing se necessário |
| Competidor (Fresha, Treatwell) entra em PT | Média | Alto | Foco em UX + personalização; parcerias locais |

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

# Beauty SaaS

> Plataforma SaaS multi-tenant para orquestração de salões de beleza. Control plane separado do data plane.

## O que é este repositório?

Este é o **control plane** da plataforma SaaS. Gere múltiplos tenants (salões), planos de subscrição, billing e operações de plataforma.

O **data plane** (a aplicação de cada salão) vive noutro repositório: [`joycehairbeauty`](../joycehairbeauty). Esta separação é deliberada — permite iteração independente, deploys independentes e zero risco de regressões em produção.

## Arquitectura em 30 segundos

```
┌─────────────────────────────────┐         HTTP/HTTPS         ┌─────────────────────────┐
│         beauty-saas              │                            │     joycehairbeauty     │
│       (control plane)           │ ───────────────────────►   │      (data plane)       │
│                                 │   Sanctum + X-Tenant-Slug  │                         │
│  ┌───────────────────────────┐  │                            │  ┌─────────────────┐    │
│  │ apps/platform-admin       │  │                            │  │   apps/api      │    │
│  │ apps/landing              │  │                            │  │   (Laravel 13)  │    │
│  │ apps/tenant-onboarding    │  │                            │  └─────────────────┘    │
│  └───────────────────────────┘  │                            │  ┌─────────────────┐    │
│  ┌───────────────────────────┐  │                            │  │   apps/web      │    │
│  │ packages/api-client       │  │                            │  │  (Next.js 16)   │    │
│  │ packages/tenancy-core     │  │                            │  └─────────────────┘    │
│  │ packages/billing          │  │                            │  PostgreSQL 18 + Redis 8 │
│  │ packages/database         │  │                            │                         │
│  │ packages/contracts        │  │                            │                         │
│  └───────────────────────────┘  │                            │                         │
└─────────────────────────────────┘                            └─────────────────────────┘
```

Para a arquitectura detalhada, ADRs e roadmap: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).
O avanço executável da Fase 1, com critérios, gates e evidências, é mantido em
[`docs/PHASE-1-EXECUTION.md`](./docs/PHASE-1-EXECUTION.md).

## Stack

| Camada           | Tecnologia                   | Versão | Razão                                  |
| ---------------- | ---------------------------- | ------ | -------------------------------------- |
| Frontend apps    | Next.js (App Router) + React | 16.2   | Alinhado com joycehairbeauty           |
| Linguagem        | TypeScript                   | 5.9    | Strict mode, inferência Zod            |
| Estilos          | Tailwind CSS                 | v4     | Alinhado com joycehairbeauty           |
| Validação        | Zod                          | 4.0    | Schemas runtime + tipos estáticos      |
| Billing          | Stripe SDK                   | 19.x   | Standard da indústria                  |
| Control plane DB | PostgreSQL + node-postgres   | 18 / 8 | Persistência explícita e transaccional |
| Monorepo         | pnpm workspaces              | 11.5   | Alinhado com joycehairbeauty           |
| Routing wildcard | Traefik                      | v3     | DNS-01 challenge para wildcard certs   |

## Estrutura

```
beauty-saas/
├── apps/
│   ├── platform-admin/       Painel super-admin (gestão de tenants, MRR, impersonar)
│   ├── landing/              Site público beauty.nbtech.pt (pricing, features, signup)
│   └── tenant-onboarding/    Wizard /register → criar tenant → trial 14 dias
├── packages/
│   ├── api-client/           Cliente HTTP tipado para a API de joycehairbeauty
│   ├── tenancy-core/         Lógica de identificação de tenant (subdomínio, header)
│   ├── billing/              Wrapper Stripe, webhooks, planos, quotas
│   ├── database/             PostgreSQL server-only, migrations e repositories
│   └── contracts/            Schemas Zod partilhados entre apps
├── docs/
│   ├── ARCHITECTURE.md       Documento principal
│   ├── PHASE-1-EXECUTION.md  Tracker verificável da Fase 1
│   ├── adr/                  Architecture Decision Records
│   └── api/                  OpenAPI snapshot da API consumida
└── infra/
    ├── traefik/              Config wildcard *.beauty.nbtech.pt
    └── scripts/              Setup, dev, deploy
```

## Estado actual

> **Estado**: Fase 0 concluída; Fase 1 em progresso
>
> **Última actualização**: 2026-08-15

| Componente               | Estado        | Realidade actual                                                                                                                            |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 0 — Bootstrap       | **Concluído** | Monorepo, documentação, ADRs e configuração base criados.                                                                                   |
| `packages/contracts`     | **Parcial**   | Schemas e tipos do domínio mapeado implementados e testados; falta validar contratos com mais payloads reais.                               |
| `packages/api-client`    | **Parcial**   | Cliente HTTP e módulos operacionais implementados; o último teste rápido documentado detectou quatro divergências no formato de transporte. |
| `packages/billing`       | **Parcial**   | Wrapper Stripe, catálogo, clientes Stripe, subscrições, checkout, portal, webhooks e quotas implementados ao nível da biblioteca.           |
| `packages/database`      | **Parcial**   | Primeira migration e repository tenant+owner implementados; os gates de segurança e concorrência ainda estão em correcção.                  |
| `apps/platform-admin`    | **Parcial**   | Protótipo de billing com catálogo, checkout, portal e endpoint de webhook; não representa a Fase 2 concluída.                               |
| `apps/landing`           | **Pendente**  | Stub, sem landing nem pricing funcional.                                                                                                    |
| `apps/tenant-onboarding` | **Pendente**  | Stub, sem wizard de registo.                                                                                                                |
| `packages/tenancy-core`  | **Pendente**  | Stub, sem resolução de tenant.                                                                                                              |

O fluxo **registo → checkout/período experimental → webhook idempotente → tenant activo → primeiro agendamento** ainda não está concluído nem validado de ponta a ponta. Ver critérios verificáveis e roadmap em [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Quickstart (dev)

```bash
# 1. Setup
nvm use
pnpm install

# 2. Executar os testes existentes
pnpm test

# 3. Iniciar a landing (a aplicação continua em estado de stub)
pnpm dev
```

> Limitação conhecida: `pnpm typecheck` ainda não termina com sucesso porque `apps/landing` e `packages/tenancy-core` são stubs sem `tsconfig.json`.

## Convenções

- **Commits**: Conventional Commits em inglês (`feat:`, `fix:`, `chore:`, `docs:`)
- **Branches**: `main` (produção), `develop` (staging), `feature/<slug>` (trabalho)
- **PRs**: squash merge, com referência à issue
- **Versões**: SemVer, geridas com `changesets` (a adicionar)
- **Segredos**: nunca em commits, usar `.env.local` (ver `.env.example` quando existir)

## Relação com joycehairbeauty

| joycehairbeauty               | beauty-saas                             |
| ----------------------------- | --------------------------------------- |
| Produção, estável             | WIP, experimental                       |
| Salão único                   | Multi-tenant                            |
| Deploy via Dokploy + Nixpacks | Deploy independente (Dokploy ou Vercel) |
| Laravel + Sanctum             | Next.js + Stripe                        |
| Schema fixo (1 tenant)        | Schema dinâmico (N tenants via API)     |

**Regra de ouro**: tudo o que toca em dados de tenants passa pela API de `joycehairbeauty`. Nada é duplicado nem sincronizado por código — só por contrato de API versionado.

## Licença

Proprietary. Todos os direitos reservados.

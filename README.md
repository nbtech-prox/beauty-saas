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
│  │ packages/contracts        │  │                            │                         │
│  └───────────────────────────┘  │                            │                         │
└─────────────────────────────────┘                            └─────────────────────────┘
```

Para a arquitectura detalhada, ADRs e roadmap: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Stack

| Camada | Tecnologia | Versão | Razão |
|---|---|---|---|
| Frontend apps | Next.js (App Router) + React | 16.2 | Alinhado com joycehairbeauty |
| Linguagem | TypeScript | 5.9 | Strict mode, inferência Zod |
| Estilos | Tailwind CSS | v4 | Alinhado com joycehairbeauty |
| Validação | Zod | 4.0 | Schemas runtime + tipos estáticos |
| Billing | Stripe SDK | 19.x | Standard da indústria |
| Monorepo | pnpm workspaces | 11.5 | Alinhado com joycehairbeauty |
| Routing wildcard | Traefik | v3 | DNS-01 challenge para wildcard certs |

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
│   └── contracts/            Schemas Zod partilhados entre apps
├── docs/
│   ├── ARCHITECTURE.md       Documento principal
│   ├── adr/                  Architecture Decision Records
│   └── api/                  OpenAPI snapshot da API consumida
└── infra/
    ├── traefik/              Config wildcard *.beauty.nbtech.pt
    └── scripts/              Setup, dev, deploy
```

## Estado actual

🚧 **Fase 0 — Bootstrap**. Estrutura criada, packages vazios com README explicativo. Nada em produção ainda.

Próximo marco: **Fase 1 — MVP vertical slice multi-tenant** (ver roadmap em `docs/ARCHITECTURE.md`).

## Quickstart (dev)

```bash
# 1. Setup
nvm use
pnpm install

# 2. Validar estrutura
pnpm typecheck

# 3. (Em breve) Rodar landing em dev
pnpm dev
```

## Convenções

- **Commits**: Conventional Commits em inglês (`feat:`, `fix:`, `chore:`, `docs:`)
- **Branches**: `main` (produção), `develop` (staging), `feature/<slug>` (trabalho)
- **PRs**: squash merge, com referência à issue
- **Versões**: SemVer, geridas com `changesets` (a adicionar)
- **Segredos**: nunca em commits, usar `.env.local` (ver `.env.example` quando existir)

## Relação com joycehairbeauty

| joycehairbeauty | beauty-saas |
|---|---|
| Produção, estável | WIP, experimental |
| Salão único | Multi-tenant |
| Deploy via Dokploy + Nixpacks | Deploy independente (Dokploy ou Vercel) |
| Laravel + Sanctum | Next.js + Stripe |
| Schema fixo (1 tenant) | Schema dinâmico (N tenants via API) |

**Regra de ouro**: tudo o que toca em dados de tenants passa pela API de `joycehairbeauty`. Nada é duplicado nem sincronizado por código — só por contrato de API versionado.

## Licença

Proprietary. Todos os direitos reservados.

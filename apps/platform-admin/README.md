# @beauty-saas/platform-admin

Painel interno para o **dono da plataforma** (não confundir com admin do salão). Acessível em `admin.beauty.nbtech.pt`.

## Responsabilidades

- Lista de tenants (com filtros: trial, active, past_due, canceled)
- Detalhe de tenant (dono, plano, MRR, uso de quotas, log de actividades)
- Impersonar tenant (com audit log visível)
- Suspender/reativar manualmente
- Métricas: MRR total, ARR, churn rate, novos trials/semana
- Webhook events (debug de Stripe)

## Permissões

- **platform_admin**: acesso total
- **platform_support**: impersonar + ler logs, sem suspender
- **platform_viewer**: read-only

(Implementação fase 2 — começa apenas com platform_admin.)

## Stack

- Next.js 16.2 (App Router, Server Actions)
- React 19
- Tailwind v4 + shadcn/ui (DataTable, Charts via Recharts)
- Auth: NextAuth.js ou solução custom Sanctum

## Estrutura

```
app/
├── (auth)/login/page.tsx
├── (dashboard)/
│   ├── page.tsx                 Overview + métricas
│   ├── tenants/
│   │   ├── page.tsx             Lista
│   │   └── [id]/page.tsx        Detalhe
│   ├── webhooks/page.tsx        Stripe events
│   └── audit/page.tsx           Audit log
└── api/
    └── webhooks/stripe/route.ts
```

## Status

🚧 **Stub**. Nada implementado ainda.

## Dev

```bash
pnpm dev   # porta 3001
```

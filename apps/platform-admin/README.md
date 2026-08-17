# @beauty-saas/platform-admin

Painel interno para o **dono da plataforma** (não confundir com admin do salão). Acessível em `admin.beauty.nbtech.pt`.

## Responsabilidades planeadas para a Fase 2

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

(A Fase 2 começa apenas com `platform_admin`; estas responsabilidades não estão implementadas no protótipo actual.)

## Stack

- Next.js 16.2 (App Router, Server Actions)
- React 19
- Tailwind v4 + shadcn/ui (DataTable, Charts via Recharts)
- Auth: NextAuth.js ou solução custom Sanctum

## Estrutura alvo da Fase 2

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

## Estado

> **Estado da Fase 1**: **Parcial — protótipo de billing**
>
> **Estado da Fase 2**: **Pendente**
>
> **Última actualização**: 2026-08-15

Implementado no protótipo actual:

- centro de navegação;
- catálogo e detalhe de planos;
- formulário e endpoint para criar Checkout Sessions;
- página e endpoint para abrir o Customer Portal;
- endpoint de webhook com verificação de assinatura, classificação, log e ACK.

Limites actuais:

- checkout e portal sem autenticação/validação de propriedade do tenant;
- `tenantId` de demonstração criado no navegador;
- webhook sem persistência idempotente nem efeitos de negócio;
- cobertura automatizada limitada a 1 teste da página de detalhe de plano;
- lista/detalhe de tenants, MRR, churn, impersonação, suspensão e audit log continuam pendentes.

Este protótipo apoia a Fase 1, mas **não significa que o checkout/webhook de ponta a ponta ou a Fase 2 estejam concluídos**.

## Dev

```bash
pnpm dev   # porta 3001
```

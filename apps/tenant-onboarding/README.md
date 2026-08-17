# @beauty-saas/tenant-onboarding

Wizard público de signup, em `/register`. Leva um novo salão de "quero experimentar" a "tenho trial de 14 dias activos".

## Fluxo (3 passos)

### Passo 1 — Conta

- Email
- Password (>= 12 chars, com Zxcvbn score)
- Nome pessoal

### Passo 2 — Salão

- Nome do salão
- Subdomínio desejado (validação em tempo real contra API `GET /tenants/check-slug`)
- Timezone (default `Europe/Lisbon`)
- Moeda (default `EUR`)

### Passo 3 — Plano

- **Free Trial** (default, 14 dias, sem cartão)
- OU **Starter / Pro / Business** com Stripe Checkout inline

### Sucesso

- Email de boas-vindas (Resend)
- Redirect para `https://<slug>.beauty.nbtech.pt/setup` (rota no joycehairbeauty para wizard inicial de serviços)

## Stack

- Next.js 16.2
- React 19
- Server Actions para o form
- Stripe Elements para pagamento no passo 3
- shadcn/ui Form components

## Estado

> **Estado da Fase 1**: **Pendente**
>
> **Última actualização**: 2026-08-15

**Stub**. O wizard, a criação de conta/tenant e a integração de checkout ainda não estão implementados.

## Dev

```bash
pnpm dev   # porta 3002
```

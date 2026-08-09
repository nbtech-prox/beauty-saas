# @beauty-saas/billing

Camada de abstracção sobre **Stripe** para o SaaS. Usado por `platform-admin` (gestão) e `tenant-onboarding` (checkout).

## Responsabilidades

- Wrapper tipado sobre `stripe-node` (cliente singleton)
- Definição de **planos** (sincronizados com Stripe via `stripe:price:*`)
- **Webhooks** receiver idempotente (`webhook_events` table)
- Cálculo de **quotas** por tenant (profissionais, agendamentos, storage)
- Helpers para `Checkout Session`, `Customer Portal`, `Subscription` lifecycle

## Planos (proposta)

| Plan | Stripe Price ID | Quota profissionais | Quota agendamentos/mês | Storage |
|---|---|---|---|---|
| free (trial 14d) | — | 1 | 50 | 100 MB |
| starter | env | 3 | 500 | 1 GB |
| pro | env | 10 | 2 000 | 5 GB |
| business | env | ∞ | ∞ | 50 GB |

## Estrutura (planeada)

```
src/
├── index.ts
├── stripe.ts            Cliente singleton + helpers
├── plans.ts             PLAN_REGISTRY, getPlanById, getPlanByPriceId
├── webhooks.ts          handleWebhook(event) → dispatch idempotente
├── checkout.ts          createCheckoutSession, createPortalSession
├── quotas.ts            QuotaChecker, QuotaExceededError
└── types.ts
```

## Webhooks suportados

| Evento Stripe | Acção |
|---|---|
| `customer.subscription.created` | Activar tenant |
| `customer.subscription.updated` | Sincronizar plano + quotas |
| `customer.subscription.deleted` | Marcar canceled (grace 7d) |
| `invoice.payment_failed` | past_due + email |
| `invoice.paid` | Reactivar se estava past_due |
| `checkout.session.completed` | Onboarding completo |

## Idempotência

```ts
await db.webhook_events.insert({
  stripe_event_id: event.id,  // UNIQUE
  type: event.type,
  payload: event,
  processed_at: new Date(),
});
// Reentregas do mesmo event.id → no-op
```

## Status

🚧 **Stub**. Nada implementado.

## Dev

```bash
# Testar webhook localmente
stripe listen --forward-to localhost:3001/api/webhooks/stripe
stripe trigger customer.subscription.created
```

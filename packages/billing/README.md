# @beauty-saas/billing

Camada de abstracção sobre **Stripe** para o SaaS. Usado por `platform-admin` (gestão) e `tenant-onboarding` (checkout).

## Responsabilidades

- Wrapper tipado sobre `stripe-node` (cliente singleton)
- **Planos comerciais** (registry estático, mapeado a Stripe Price IDs via env vars)
- **Webhooks** com verificação de assinatura HMAC-SHA256 e encaminhamento tipado; a persistência idempotente pertence à aplicação e continua pendente
- **Customer** management (1 tenant = 1 customer, com `metadata.tenant_id`)
- **Subscriptions** lifecycle (criar, cancelar, reactivar) com trial/coupon
- **Checkout Session** (hosted Stripe UI)
- **Customer Portal** (hosted Stripe UI)
- Cálculo de **quotas** por tenant (profissionais, serviços, agendamentos, localizações)

## Subpath exports

```ts
// Tudo
import { createCheckoutSession, checkQuota } from "@beauty-saas/billing";

// Por módulo (tree-shakable)
import {
  verifyWebhook,
  WebhookSignatureError,
} from "@beauty-saas/billing/webhooks";
import { ensureCustomerForTenant } from "@beauty-saas/billing/customers";
```

## Variáveis de ambiente

| Var                               | Obrigatório | Descrição                         |
| --------------------------------- | ----------- | --------------------------------- |
| `STRIPE_SECRET_KEY`               | sim         | `sk_test_...` ou `sk_live_...`    |
| `STRIPE_WEBHOOK_SECRET`           | sim         | `whsec_...` (do Stripe Dashboard) |
| `STRIPE_PRICE_STARTER_MONTHLY`    | opcional    | `price_xxx` do plano              |
| `STRIPE_PRICE_STARTER_YEARLY`     | opcional    | `price_xxx` do plano              |
| `STRIPE_PRICE_PRO_MONTHLY`        | opcional    | `price_xxx` do plano              |
| `STRIPE_PRICE_PRO_YEARLY`         | opcional    | `price_xxx` do plano              |
| `STRIPE_PRICE_ENTERPRISE_MONTHLY` | opcional    | `price_xxx` do plano              |
| `STRIPE_PRICE_ENTERPRISE_YEARLY`  | opcional    | `price_xxx` do plano              |

> Mapeamento plano ↔ Price ID é via env var para permitir a mesma build contra `test` e `live` do Stripe sem rebuild.

## Planos (catálogo)

| Plan code            | Tier       | Interval | Price     | Quota profissionais | Quota bookings/mês |
| -------------------- | ---------- | -------- | --------- | ------------------- | ------------------ |
| `starter-monthly`    | starter    | monthly  | €19.00    | 3                   | 500                |
| `starter-yearly`     | starter    | yearly   | €190.00   | 3                   | 500                |
| `pro-monthly`        | pro        | monthly  | €49.00    | 10                  | 2 000              |
| `pro-yearly`         | pro        | yearly   | €490.00   | 10                  | 2 000              |
| `enterprise-monthly` | enterprise | monthly  | €199.00   | 100                 | 20 000             |
| `enterprise-yearly`  | enterprise | yearly   | €1 990.00 | 100                 | 20 000             |

## Estrutura

```
src/
├── stripe.ts          Cliente singleton + helpers
├── plans.ts           PLAN_DEFINITIONS + lookups por code/env/PriceId
├── customers.ts       ensureCustomerForTenant, findCustomerByTenantId
├── subscriptions.ts   createSubscription, cancel/reactivate/get/list
├── checkout.ts        createCheckoutSession (subscription + payment mode)
├── portal.ts          createPortalSession
├── webhook.ts         verifyWebhook + dispatchKnownEvent (tipado)
├── quotas.ts          checkQuota + QuotaExceededError
└── index.ts           Exports públicos (re-exports + aliases para subpaths)
tests/
├── webhook.test.ts    Verificação de assinatura HMAC + replay protection
├── plans.test.ts      Registry de planos
├── stripe.test.ts     Cliente singleton + cache + env config
├── customers.test.ts  Find/ensure/create com mock do SDK
├── subscriptions.test.ts  Lifecycle com mock do SDK
├── checkout.test.ts   Checkout Session com mock do SDK
├── portal.test.ts     Portal Session com mock do SDK
├── quotas.test.ts     Enforcement de quotas
└── _helpers.ts        Fixtures + createMockStripeSdk
```

## Webhooks suportados

| Evento Stripe                   | Acção                        |
| ------------------------------- | ---------------------------- |
| `customer.subscription.created` | Activar tenant               |
| `customer.subscription.updated` | Sincronizar plano + quotas   |
| `customer.subscription.deleted` | Marcar canceled (grace 7d)   |
| `invoice.payment_failed`        | past_due + email             |
| `invoice.paid`                  | Reactivar se estava past_due |
| `checkout.session.completed`    | Onboarding completo          |

### Verificação de assinatura

```ts
import {
  verifyWebhook,
  WebhookSignatureError,
} from "@beauty-saas/billing/webhooks";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();
  try {
    const event = verifyWebhook(raw, sig, {
      secret: process.env.STRIPE_WEBHOOK_SECRET!,
      toleranceSeconds: 300,
    });
    // ... dispatch idempotente via INSERT INTO webhook_events
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return Response.json({ error: err.message }, { status: err.httpStatus });
    }
    throw err;
  }
}
```

`WebhookSignatureError.httpStatus = 401` para qualquer falha de assinatura (incluindo secret errado, payload tampering, replay attack fora da tolerância).

## Idempotência

Reentregas do mesmo `evt_xxx` devem ser no-op a nível de DB:

```sql
INSERT INTO webhook_events (provider, external_event_id, type, payload)
VALUES ('stripe', $eventId, $type, $payload)
ON CONFLICT (provider, external_event_id) DO NOTHING
RETURNING id;
-- Se RETURNING vazio → já foi processado, no-op.
```

## Quotas

```ts
import { checkQuota, QuotaExceededError } from "@beauty-saas/billing/quotas";
import { getPlanByCode } from "@beauty-saas/billing/plans";

try {
  checkQuota(getPlanByCode(tenant.planCode), {
    maxProfessionals: tenant.professionals.length,
    maxServices: tenant.services.length,
    maxBookingsPerMonth: await countBookingsThisMonth(tenant.id),
    maxLocations: tenant.locations.length,
  });
} catch (err) {
  if (err instanceof QuotaExceededError) {
    return Response.json({ error: err.message }, { status: 402 });
  }
  throw err;
}
```

`QuotaExceededError.httpStatus = 402` (Payment Required — semanticamente, "passa para outro plano").

## Versão da Stripe API pinada

`PINNED_STRIPE_API_VERSION = '2025-09-30.clover'`

Isto desacopla o nosso package do SDK — quando o `stripe-node` é actualizado pelo pnpm, não partimos a verificação de webhook por mudança de comportamento.

## Dev

```bash
# Testes
pnpm test

# Typecheck
pnpm typecheck

# Testar webhook localmente
stripe listen --forward-to localhost:3001/api/webhooks/stripe
stripe trigger customer.subscription.created
```

## Estado

> **Estado da Fase 1**: **Parcial**
>
> **Última actualização**: 2026-08-15

As primitivas da biblioteca estão implementadas. Verificação em 2026-08-15: **84/84 testes** passaram em 8 ficheiros.

Isto não equivale a um fluxo de billing concluído: o checkout real ainda não foi validado de ponta a ponta, e o endpoint em `apps/platform-admin` apenas verifica, classifica, regista no log e confirma eventos. Persistência idempotente e efeitos de negócio sobre tenants/subscrições continuam pendentes.

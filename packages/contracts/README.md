# @beauty-saas/contracts

**Schemas Zod** + tipos TS partilhados entre todas as apps e packages. Source of truth dos contratos de dados.

## Responsabilidades

- Definir schemas Zod para **Tenant**, **Plan**, **Subscription**, **Service**, **Appointment**, etc.
- Exportar tipos TypeScript inferidos via `z.infer<typeof schema>`
- Garantir que **runtime validation** + **compile-time types** estão alinhados
- Documentar cada schema (JSDoc)

## Princípio

> Se um dado atravessa uma fronteira (HTTP, fila, DB, webhook), tem um schema Zod aqui.

## Estrutura (planeada)

```
src/
├── index.ts              Re-exports
├── tenant.ts             TenantSchema, TenantStatus enum
├── plan.ts               PlanSchema, PLAN_IDS
├── subscription.ts       SubscriptionSchema, SubscriptionStatus
├── service.ts            ServiceSchema, PriceType enum
├── appointment.ts        AppointmentSchema, AppointmentStatus
├── common.ts             PaginatedResponse, ApiError, UUID, ISODateString
└── __tests__/            Cada schema com testes de validação
```

## Exemplo (planeado)

```ts
// src/tenant.ts
import { z } from 'zod';

export const TenantStatus = z.enum([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'suspended',
]);
export type TenantStatus = z.infer<typeof TenantStatus>;

export const TenantSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(3).max(32).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  status: TenantStatus,
  timezone: z.string().default('Europe/Lisbon'),
  currency: z.literal('EUR').default('EUR'),
  createdAt: z.string().datetime(),
  trialEndsAt: z.string().datetime().nullable(),
});

export type Tenant = z.infer<typeof TenantSchema>;
```

## Regras de ouro

1. ❌ Nunca exportar tipos sem schema Zod associado
2. ❌ Nunca usar `any` — inferir do schema
3. ✅ Cada mudança de schema é **breaking change** → bump major version
4. ✅ Schemas testados com payloads reais da API (snapshots)

## Status

🚧 **Stub**. Nada implementado. Próximo passo: copiar `Service` e `Tenant` para aqui a partir do `joycehairbeauty` (read-only, sem alterar produção).

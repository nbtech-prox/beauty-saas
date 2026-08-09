# @beauty-saas/contracts

**Schemas Zod** + tipos TS partilhados entre todas as apps e packages. Source of truth dos contratos de dados.

## Responsabilidades

- Definir schemas Zod para **Tenant**, **Plan**, **Subscription**, **Service**, **Appointment**, etc.
- Exportar tipos TypeScript inferidos via `z.infer<typeof schema>`
- Garantir que **runtime validation** + **compile-time types** estão alinhados
- Documentar cada schema (JSDoc)

## Princípio

> Se um dado atravessa uma fronteira (HTTP, fila, DB, webhook), tem um schema Zod aqui.

## Estrutura

```
src/
├── index.ts              Re-exports de todos os schemas
├── common.ts             UuidSchema, SlugSchema, EmailSchema, IsoDateString,
│                         CurrencySchema, TimezoneSchema, LocaleSchema,
│                         PaginatedResponse<T>, ApiErrorSchema,
│                         ApiResponse<T> (discriminated union)
├── tenant.ts             TenantStatusSchema, TenantSchema,
│                         TenantCreateInputSchema, TenantUpdateInputSchema
├── plan.ts               PlanTierSchema, BillingIntervalSchema, PlanFeatureSchema,
│                         PlanLimitsSchema, PlanSchema, PLAN_CODES
├── subscription.ts       SubscriptionStatusSchema, SubscriptionSchema,
│                         SubscriptionCreateInputSchema
├── service.ts            PriceTypeSchema, ServiceSchema,
│                         ServiceConsistentSchema (refinement price↔priceType),
│                         ServiceCreateInputSchema
└── *.test.ts             Vitest — 75 testes, ~100% coverage dos schemas
```

## Status

✅ **v0.1 implementado**. Schemas Zod com testes, build verde, typecheck verde.

- `pnpm test` → 75/75 testes passam
- `pnpm typecheck` → 0 erros
- `pnpm build` → ESM + DTS gerados

## Decisões de design

1. **Currency é fixo (`EUR`)** — não há default porque é um literal, não enum. Adicionar moedas no futuro exige migração explícita.
2. **Timezone default = `Europe/Lisbon`** — o primeiro mercado é PT. Schema permite override explícito.
3. **Service tem cross-field refinement** (`ServiceConsistentSchema`) — `priceType='fixed'` exige `price>0`; `consult`/`free` exigem `price=null`. Impede inconsistências no domínio.
4. **PaginatedResponse e ApiResponse são genéricos** — passas o schema do item e ele embrulha com metadata. Sem duplicação.
5. **Imports com extensão `.js`** — compatível com `moduleResolution: bundler` e garante ESM correcto no Node quando consumido sem bundler.
6. **Sem dependências runtime além de `zod`** — leve (~50KB) e deterministic.

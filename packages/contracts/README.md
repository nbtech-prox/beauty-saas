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
│
│   # Domínio core (vive em beauty-saas)
├── tenant.ts             TenantStatusSchema, TenantSchema,
│                         TenantCreateInputSchema, TenantUpdateInputSchema
├── plan.ts               PlanTierSchema, BillingIntervalSchema, PlanFeatureSchema,
│                         PlanLimitsSchema, PlanSchema, PLAN_CODES
├── subscription.ts       SubscriptionStatusSchema, SubscriptionSchema,
│                         SubscriptionCreateInputSchema
├── user.ts               TenantUserRoleSchema, PermissionBitmaskSchema,
│                         TenantUserSchema, TenantUserInviteInputSchema,
│                         TenantUserUpdateRoleInputSchema,
│                         EndUserSchema, EndUserPublicInputSchema,
│                         RBAC_MATRIX, permissionsForRole, hasPermission
│
│   # Domínio operacional (partilhado com joycehairbeauty via api-client)
├── service.ts            PriceTypeSchema, ServiceSchema,
│                         ServiceConsistentSchema (refinement price↔priceType),
│                         ServiceCreateInputSchema
├── location.ts           LocationStatusSchema, CoordinatesSchema,
│                         LocationSchema, LocationCreateInputSchema
├── appointment.ts        AppointmentStatusSchema, AppointmentCanceledBySchema,
│                         AppointmentSchema, AppointmentConsistentSchema
│                         (cross-field: status↔timestamps),
│                         AppointmentCreateInputSchema,
│                         AppointmentActionSchema, AppointmentActionInputSchema
│
│   # Infraestrutura
├── webhook.ts            WebhookProviderSchema, WebhookProcessingStatusSchema,
│                         WebhookEventRecordSchema,
│                         StripeWebhookEventSchema, StripeKnownEventSchema
│                         (discriminated union por type),
│                         StripeWebhookHeadersSchema, STRIPE_WEBHOOK_TYPES
├── audit-log.ts          AuditActionSchema, AuditSeveritySchema,
│                         AuditLogSchema, AuditLogCreateInputSchema,
│                         AuditLogFilterSchema
│
└── *.test.ts             Vitest — 189 testes
```

## Status

✅ **v0.2 implementado**. Cobertura completa do domínio mapeado em `docs/ARCHITECTURE.md`.

- `pnpm test` → 189/189 testes passam (10 ficheiros de teste)
- `pnpm typecheck` → 0 erros
- `pnpm build` → ESM + DTS gerados (10 entries, ~30KB total)

## Subpath imports

Cada domínio tem um subpath próprio para tree-shaking óptimo:

```ts
import { TenantSchema } from '@beauty-saas/contracts/tenant';
import { AppointmentSchema } from '@beauty-saas/contracts/appointment';
import { StripeKnownEventSchema } from '@beauty-saas/contracts/webhook';
import { AuditLogSchema } from '@beauty-saas/contracts/audit-log';
```

Ou import geral (puxa tudo):

```ts
import * as C from '@beauty-saas/contracts';
```

## Cobertura por entidade (ARCHITECTURE.md §4.1)

| Entidade | Schema | Status |
|---|---|---|
| `Tenant` | `tenant.ts` | ✅ |
| `Plan` | `plan.ts` | ✅ |
| `Subscription` | `subscription.ts` | ✅ |
| `TenantUser` | `user.ts` | ✅ |
| `EndUser` | `user.ts` | ✅ |
| `Service` | `service.ts` | ✅ |
| `Location` | `location.ts` | ✅ |
| `Appointment` | `appointment.ts` | ✅ |
| `AuditLog` | `audit-log.ts` | ✅ |
| `WebhookEvent` | `webhook.ts` | ✅ |
| `Professional` | — | ⏭️ (joycehairbeauty-only; sem necessidade de schema partilhado por agora) |

## Decisões de design

1. **Currency é fixo (`EUR`)** — não há default porque é um literal, não enum. Adicionar moedas no futuro exige migração explícita.
2. **Timezone default = `Europe/Lisbon`** — o primeiro mercado é PT. Schema permite override explícito.
3. **Service tem cross-field refinement** (`ServiceConsistentSchema`) — `priceType='fixed'` exige `price>0`; `consult`/`free` exigem `price=null`. Impede inconsistências no domínio.
4. **Appointment tem cross-field refinement** (`AppointmentConsistentSchema`) — `status='canceled'` exige `canceledBy`+`canceledAt`; `checked_in` exige `checkedInAt`; `completed` exige ambos. Usa `superRefine` para erros multi-path.
5. **PaginatedResponse e ApiResponse são genéricos** — passas o schema do item e ele embrulha com metadata. Sem duplicação.
6. **StripeKnownEventSchema é discriminated union** por `type` — handlers ficam tipados com narrowing automático.
7. **RBAC_MATRIX é fonte de verdade** exportada — frontend pode esconder/mostrar UI sem round-trip. Backend é autoridade em caso de divergência.
8. **Imports com extensão `.js`** — compatível com `moduleResolution: bundler` e garante ESM correcto no Node quando consumido sem bundler.
9. **Sem dependências runtime além de `zod`** — leve (~50KB) e deterministic.

## Próximos passos (fora deste PR)

- Snapshot tests com payloads reais capturados da API
- Schema `Professional` se houver partilha cross-system
- OpenAPI codegen a partir dos schemas Zod (Fase 2 do ARCHITECTURE.md)

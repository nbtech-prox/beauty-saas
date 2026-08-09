# @beauty-saas/tenancy-core

Lógica de **identificação de tenant** a partir de um pedido HTTP. Server-only (Node runtime).

## Responsabilidades

- Extrair `tenantSlug` do header `X-Tenant-Slug` (vindo do Traefik)
- Validar slug (formato, subdomínios reservados)
- Resolver `tenantId` via cache (Redis) → DB
- Devolver `Tenant` validado (Zod) ou erro tipado
- Helpers para injectar `tenantId` em chamadas `api-client`

## Slugs reservados

Estes subdomínios NUNCA podem ser usados por tenants (retornam 404):

```
www, api, app, admin, platform, mail, ftp, cdn, static, assets,
status, help, support, docs, blog, auth, login, register,
checkout, billing, webhooks, stripe, _acme-challenge
```

## Estrutura (planeada)

```
src/
├── index.ts
├── resolve.ts       extractSlugFromRequest, resolveTenant
├── reserved.ts      RESERVED_SLUGS + isReserved()
├── cache.ts         Redis-backed cache (TTL 5min)
└── types.ts         TenantContext
```

## Uso (planeado)

```ts
// apps/landing/middleware.ts
import { resolveTenant } from '@beauty-saas/tenancy-core/resolve';

export async function middleware(req: NextRequest) {
  const ctx = await resolveTenant(req);
  if (!ctx) return new NextResponse('Tenant not found', { status: 404 });
  // ctx.tenantId, ctx.tenantSlug, ctx.plan
}
```

## Status

🚧 **Stub**. Nada implementado.

## Importante

> Este package é usado **apenas no control plane** (`beauty-saas`).
> No **data plane** (`joycehairbeauty`), a identificação de tenant é feita
> por middleware Laravel (`IdentifyTenant`) — концепualmente equivalente,
> mas implementado em PHP porque é onde o request é processado.

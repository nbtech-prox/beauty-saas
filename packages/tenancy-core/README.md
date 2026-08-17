# @beauty-saas/tenancy-core

Resolução de tenant a partir de um slug (subdomínio) e cache em memória com TTL. Server-only (Node runtime).

> **Estado da Fase 1**: parcial — Marco 6 (resolve + cache) concluído em 2026-08-17
>
> **Última actualização**: 2026-08-17

## Responsabilidades

- `resolveTenantBySlug(slug, options)` consulta o `JOYCE_RESOLVE_URL` configurado (default `http://localhost:3000/tenancy/resolve`) e devolve `TenantResolution` com o estado do tenant.
- Normaliza o slug para `[a-z0-9-]{3,30}`. Slugs que não respeitem a forma são rejeitados como `not_found` sem chamar o data plane.
- `TenantResolutionCache` armazena respostas por 60 segundos (TTL configurável) em memória; `not_found` não fica em cache para evitar loops quando o slug ainda está a ser provisionado.
- Usa `AbortSignal.timeout(2500)` para tolerar falhas transitórias do data plane (5xx, timeout, DNS) sem propagar excepções para o caller.

## API

```ts
import {
  resolveTenantBySlug,
  TenantResolutionCache,
} from '@beauty-saas/tenancy-core';

const result = await resolveTenantBySlug('salao-aurora');
// -> { status: "active", tenantId: "uuid", slug: "salao-aurora", name: "Salão Aurora", planCode: "pro-monthly" }

// Injeccção de fetch para testes
await resolveTenantBySlug('salao-aurora', { fetchImpl: myMockedFetch });

// Cache personalizável
const cache = new TenantResolutionCache();
// TTL padrão 60s, configurável em set(slug, value, ttlMs)
```

## Tipos públicos

```ts
type TenantStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'suspended'
  | 'not_found'
  | 'reserved';

interface TenantResolution {
  status: TenantStatus;
  tenantId?: string;
  slug?: string;
  name?: string;
  planCode?: string;
}
```

## Variáveis de ambiente

- `JOYCE_RESOLVE_URL` — base URL do endpoint de tenancy do data plane. Sem default em produção; default `http://localhost:3000/tenancy/resolve` em desenvolvimento.

## Estrutura

```
src/
├── index.ts       re-exports públicos
├── resolve.ts     resolveTenantBySlug, normalizeSlug, isValidSlug
├── cache.ts       TenantResolutionCache (Map + TTL)
├── resolve.test.ts
└── cache.test.ts
```

## Importante

> Este package é usado **apenas no control plane** (`beauty-saas`).
> No **data plane** (`joycehairbeauty`), a identificação de tenant é feita
> por middleware Laravel (`IdentifyTenant`) — conceptualmente equivalente,
> mas implementado em PHP porque é onde o request é processado.

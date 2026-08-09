# @beauty-saas/api-client

Cliente HTTP **tipado e validado** para a API REST de [`joycehairbeauty`](../../../../../joycehairbeauty/apps/api). Usado por **todas** as apps SaaS.

## Responsabilidades

- Efectuar chamadas HTTP à API do data plane
- Validar request/response com schemas Zod (de `@beauty-saas/contracts`)
- Adicionar autenticação (Sanctum SPA token)
- Adicionar `X-Tenant-Slug` quando apropriado
- Retry com backoff exponencial para erros 5xx
- Logging estruturado de cada chamada

## Princípio

**A API de `joycehairbeauty` é o contrato**. Este package é o único ponto onde esse contrato é materializado em código TypeScript. Mudanças na API ⇒ mudança aqui primeiro ⇒ outras apps adaptam-se via tipos.

## Estrutura (planeada)

```
src/
├── index.ts              Re-exports
├── client.ts             HttpClient base (fetch wrapper)
├── auth.ts               Login, logout, refresh, getCurrentUser
├── tenants.ts            CRUD tenants (apenas platform_admin)
├── services.ts           Listar serviços de um tenant
├── appointments.ts       Listar/criar agendamentos
└── errors.ts             ApiError, NetworkError, ValidationError
```

## Uso (planeado)

```ts
import { createApiClient } from '@beauty-saas/api-client';

const client = createApiClient({
  baseUrl: process.env.DATA_PLANE_API_URL!,
  token: async () => getSanctumToken(),
});

const services = await client.services.list({ tenantSlug: 'demo' });
// services é tipado como Service[] (validado com Zod) —
// vinda de demo.beauty.nbtech.pt
```

## Status

🚧 **Stub**. Nada implementado. Próximo passo: implementar `client.ts` com fetch wrapper + retry + validação Zod.

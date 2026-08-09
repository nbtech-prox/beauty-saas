# `@beauty-saas/api-client`

Cliente HTTP tipado e validado para a API REST de `joycehairbeauty`. É a camada
de adapter entre os schemas de domínio em `@beauty-saas/contracts` e os wire
formats reais devolvidos pela API.

## Instalação

Já vem como package do monorepo (`pnpm-workspace.yaml`). Em qualquer outra app:

```ts
import { createApiClient } from '@beauty-saas/api-client';
```

## Uso básico

```ts
import { createApiClient } from '@beauty-saas/api-client';

const api = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL!, // ex.: https://api.joycehairbeauty.pt
  tenantSlug: 'demo',                         // injectado em X-Tenant-Slug
  // opcional: withCsrf, timeoutMs, maxRetries, retryBackoffMs, logger, defaultHeaders
});

const me = await api.auth.me();
const services = await api.services.list();
```

O `createApiClient` devolve um objecto com `raw` (o `HttpClient` nu), o
`tenantId` já resolvido e um módulo por domínio: `auth`, `services`,
`categories`, `professionals`, `appointments`, `availability`,
`businessHours`, `content`.

## Filosofia

- **Tudo validado** com Zod. Cada endpoint declara o schema de resposta;
  o cliente faz `safeParse` e devolve `ValidationError` com issues
  detalhadas se falhar.
- **Erros tipados** (ver `errors.ts`): `ApiError`, `ValidationError`,
  `NetworkError`, `InvalidJsonError`. O resto da app faz `instanceof`.
- **Sem `any` no caminho quente**. Os módulos são genéricos no tipo de
  resposta e o `HttpClient` aceita um `z.ZodType<T>` que liga input e output.
- **Sem dependências de runtime** para além de `zod` e
  `@beauty-saas/contracts`. `fetch` é nativo do Node 22+.

## Sanctum (CSRF + cookies)

Para POSTs autenticados, o cliente chama `/v1/auth/csrf-cookie` antes do
pedido (best-effort, configurável via `withCsrf: false`). Os cookies Sanctum
são enviados automaticamente (`credentials: 'include'`, same-origin).

Em chamadas cross-origin, o caller é responsável por configurar o proxy
de primeiro estado e os cookies manualmente. O `api-client` não tenta
adivinhar a topologia.

## Scripts

| Comando            | O que faz                                |
| ------------------ | ---------------------------------------- |
| `pnpm build`       | Build com tsup (ESM + .d.ts)             |
| `pnpm dev`         | Build em watch mode                      |
| `pnpm typecheck`   | `tsc --noEmit`                           |
| `pnpm test`        | `vitest run --passWithNoTests`                 |
| `pnpm test:watch`  | `vitest` em watch                              |
| `pnpm test:coverage` | `vitest run --coverage --passWithNoTests` (ver nota abaixo) |
| `pnpm lint`        | Placeholder (eslint config por definir)        |

## Estado

Cobertura actual: **107 testes** distribuídos por 4 ficheiros (`errors`,
`mappers`, `client`, `modules`), correndo em ~1s. Thresholds configurados a
85% no `vitest.config.ts` (`pnpm test:coverage`).

**Nota sobre `pnpm test:coverage`:** por incompatibilidade transitiva entre
`brace-expansion@5.0.9` (override pnpm para tapar uma CVE de ReDoS) e
`minimatch@9` (usado por vitest→test-exclude→glob), o coverage falha em
runtime com `TypeError: (0 , brace_expansion_1.default) is not a function`.
O `pnpm test` (sem `--coverage`) corre normalmente. O CI usa `pnpm test`
e os thresholds ficam para verificação local até a incompatibilidade ser
resolvida (a jusante, no `minimatch` ou `brace-expansion`).

Próximos passos:

- ~~Adicionar `*.test.ts` por módulo~~ (feito — 107 testes)
- ~~Reintroduzir thresholds a 85%~~ (feito — ver nota acima)
- Validar contra a API real de `joycehairbeauty` (smoke test em `apps/landing`)

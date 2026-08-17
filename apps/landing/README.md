# @beauty-saas/landing

Site público em `beauty.nbtech.pt` — primeira impressão para potenciais clientes.

## Estado

> **Marco 7**: landing mínimo implementado.
>
> **Última actualização**: 2026-08-17

Implementação inicial Next.js 16 (App Router) + React 19 + Tailwind v4.
Inclui homepage (hero + features + CTA), página `/precos` e página de
detalhe `/planos/[code]`. Toda a copy e preços vêm de
`@beauty-saas/contracts` e `@beauty-saas/billing` (single source da oferta
comercial).

## Stack

- Next.js 16.2 (App Router, RSC)
- React 19
- Tailwind v4 (CSS-first, `@import "tailwindcss";`)
- TypeScript 5.9 (estrito, `tsconfig.base.json` partilhado)

## Estrutura

```
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx           <html lang="pt-PT">, metadata
│   ├── page.tsx             Homepage (hero, features, CTA)
│   ├── precos/
│   │   ├── page.tsx         Grelha de planos públicos
│   │   └── precos.test.tsx  Testes SSR
│   └── planos/[code]/
│       └── page.tsx         Detalhe de um plano (server component)
├── components/
│   ├── PricingCard.tsx      Cartão de pricing reutilizável
│   └── PricingCard.test.tsx Testes SSR
└── lib/
    ├── plans.ts             Helpers (formatPriceEUR, formatPlanInterval, publicPlans)
    └── plans.test.ts        Testes
```

## Comandos

```bash
pnpm dev          # porta 3000
pnpm typecheck    # tsc --noEmit
pnpm test         # vitest run
pnpm build        # next build
```

## Notas

- `notFound()` em `/planos/[code]` quando o `code` não está no registry.
- Preços via `Intl.NumberFormat('pt-PT', { currency: 'EUR' })` —
  NBSP entre número e símbolo é o output nativo.
- `experimental.typescript.buildMode: 'standalone'` em `next.config.ts`
  para outputs Docker-friendly em deploys futuros.

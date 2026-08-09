# @beauty-saas/landing

Site público em `beauty.nbtech.pt` — primeira impressão para potenciais clientes.

## Responsabilidades

- Homepage com hero, features, social proof
- Página de pricing (componente `<PricingTable />` a partir de `packages/contracts`)
- Página de features
- Blog/recursos (fase 2)
- CTA "Começar grátis" → redireciona para `/register` (tenant-onboarding)

## Stack

- Next.js 16.2 (App Router, RSC)
- React 19
- Tailwind v4
- shadcn/ui

## Estrutura

```
app/
├── (marketing)/
│   ├── page.tsx              Homepage
│   ├── pricing/page.tsx
│   ├── features/page.tsx
│   └── about/page.tsx
├── layout.tsx
└── globals.css
components/
├── hero.tsx
├── pricing-table.tsx
└── feature-grid.tsx
```

## Status

🚧 **Stub**. Nada implementado ainda. Próximo passo: hero + pricing com dados estáticos.

## Dev

```bash
pnpm dev   # porta 3000
```

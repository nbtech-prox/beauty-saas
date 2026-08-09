# Contributing — Beauty SaaS

## Princípios

1. **Não tocar em `joycehairbeauty`** sem um ADR e um plano de rollback
2. **Testar antes de pedir review** — `pnpm typecheck && pnpm test`
3. **Commits pequenos e descritivos** — Conventional Commits
4. **Sem secrets em commits** — usar `.env.local`
5. **Documentar decisões** em `docs/adr/` antes de implementar

## Workflow

```
feature/<slug>
    │
    ▼ (PR com testes)
develop
    │
    ▼ (deploy staging)
main (deploy produção manual)
```

### Branch naming

| Tipo | Padrão | Exemplo |
|---|---|---|
| Feature | `feature/<slug>` | `feature/landing-pricing-page` |
| Fix | `fix/<slug>` | `fix/tenancy-reserved-slugs` |
| Docs | `docs/<slug>` | `docs/adr-005-rate-limiting` |
| Chore | `chore/<slug>` | `chore/bump-stripe-19.2` |
| Refactor | `refactor/<slug>` | `refactor/api-client-fetch` |

### Conventional Commits

```
feat(landing): add pricing table component
fix(tenancy-core): reject reserved slugs with 404
docs(adr): add ADR-005 rate limiting strategy
chore(deps): bump stripe to 19.2.0
test(api-client): add tenant isolation tests
```

### PR checklist

- [ ] Título segue Conventional Commits
- [ ] Descrição referencia issue (se aplicável)
- [ ] Testes passam (`pnpm typecheck && pnpm test`)
- [ ] Lint passa (`pnpm lint`)
- [ ] ADR criado/atualizado (se decisão arquitectural)
- [ ] Screenshots/GIF (se UI)
- [ ] Sem `console.log` esquecidos
- [ ] Sem secrets em `.env.example` (só placeholders)

## Stack local

- Node 22+ (ver `.nvmrc`)
- pnpm 11.5+ (ver `packageManager` no `package.json`)
- Docker (opcional, para Postgres e Redis)

## Como pedir review

1. Push da branch
2. Abrir PR no GitHub
3. Marcar 1 reviewer (2 para mudanças em `packages/billing` ou `packages/tenancy-core`)
4. Aguardar CI verde
5. Squash merge após aprovação

## Ambiguidade? Pergunta antes

Se o pedido é ambíguo ou tens 2+ formas de implementar, **abre uma issue primeiro** ou **pergunta no PR**. Não assumes.

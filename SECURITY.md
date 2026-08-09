# Security Policy

## Supported Versions

| Versão | Suportada |
|---|---|
| Em desenvolvimento (main) | ✅ |
| Anteriores | ❌ |

## Reporting a Vulnerability

**NÃO abras uma issue pública** para vulnerabilidades de segurança.

Envia email para `security@beauty.nbtech.local` (placeholder — substituir pelo real) com:

- Descrição do problema
- Passos para reproduzir
- Impacto potencial
- Sugestão de fix (se tiveres)

Resposta inicial: até 48h. Fix crítico: até 7 dias.

## Práticas aplicadas

- ✅ Sanitização de inputs via Zod em todas as fronteiras
- ✅ Sanctum SPA (cookies httpOnly, SameSite=Lax)
- ✅ Stripe webhook signature validation
- ✅ `.env` nunca comitado (`.gitignore`)
- ✅ Dependências auditadas mensalmente (`pnpm audit`)
- ✅ CVEs em overrides (ver `pnpm-workspace.yaml`)

## Não-práticas (a corrigir)

- ⏳ GitHub secret scanning (fase 2)
- ⏳ Rate limiting por IP (fase 2)
- ⏳ CSP headers estritos (fase 2)

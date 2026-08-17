# Security Policy

## Supported Versions

| Versão                    | Suportada |
| ------------------------- | --------- |
| Em desenvolvimento (main) | ✅        |
| Anteriores                | ❌        |

## Reporting a Vulnerability

**NÃO abras uma issue pública** para vulnerabilidades de segurança.

Envia email para `security@beauty.nbtech.local` (placeholder — substituir pelo real) com:

- Descrição do problema
- Passos para reproduzir
- Impacto potencial
- Sugestão de fix (se tiveres)

Resposta inicial: até 48h. Fix crítico: até 7 dias.

## Estado das práticas

| Prática                                     | Estado actual                                                     |
| ------------------------------------------- | ----------------------------------------------------------------- |
| Validação da assinatura dos webhooks Stripe | Aplicada no endpoint actual                                       |
| Queries PostgreSQL parametrizadas           | Aplicada em `packages/database`                                   |
| `FORCE ROW LEVEL SECURITY`                  | Aplicado nas tabelas tenant-scoped actualmente criadas            |
| Roles PostgreSQL separadas por serviço      | CLI de migrations separado; bootstrap das roles ainda pendente    |
| Segredos fora do repositório                | `.env*` local ignorado; `.env.example` contém apenas placeholders |
| Overrides de CVEs conhecidos                | Configurados em `pnpm-workspace.yaml`                             |
| Validação Zod em todas as fronteiras        | Parcial; ainda não cobre todo o onboarding e autenticação         |
| Persistência/idempotência de webhooks       | Pendente na Fase 1                                                |
| Autenticação e sessão do control plane      | Pendente na Fase 1; os endpoints de billing ainda são públicos    |
| Ownership e autorização de tenant           | Pendente na Fase 1                                                |
| Rate limiting                               | Pendente                                                          |
| CSP e restantes security headers            | Pendente                                                          |
| Auditoria automatizada de dependências      | Pendente; executar `pnpm audit --prod` manualmente                |
| GitHub secret scanning                      | Pendente de configuração                                          |

O estado técnico e os critérios de fecho são mantidos em
[`docs/PHASE-1-EXECUTION.md`](./docs/PHASE-1-EXECUTION.md). Não considerar uma
prática aplicada apenas porque está prevista na arquitectura.

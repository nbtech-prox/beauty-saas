# ADR-001: Subdomínios wildcard vs path prefix

> **Estado**: ✅ Aceite
> **Data**: 2026-08-09
> **Decisor**: Beauty SaaS team
> **Contexto**: Identificação de tenant no control plane

## Contexto

Cada salão (tenant) precisa de ser identificável unicamente no URL. Duas abordagens principais:

1. **Subdomínio por tenant**: `joyce.beauty.nbtech.pt`
2. **Path prefix**: `beauty.nbtech.pt/t/joyce`

## Decisão

Usamos **subdomínios wildcard** (`*.beauty.nbtech.pt`).

## Consequências

### Positivas
- ✅ Identidade visual clara por tenant (subdomínio = marca)
- ✅ Possível usar cookies scoped ao subdomínio (sem leakage cross-tenant)
- ✅ SSL wildcard (Let's Encrypt DNS-01) é grátis
- ✅ Cada tenant pode, no futuro, ter domínio próprio (`agendamento.omeusalao.pt`) mapeado para o mesmo subdomínio
- ✅ SEO: cada salão é rankeável independentemente

### Negativas
- ⚠️ Setup inicial mais complexo (DNS wildcard, Traefik, certificados)
- ⚠️ Subdomínios reservados (`www`, `api`, `admin`) precisam de ser reservados/negados
- ⚠️ Desenvolvimento local precisa de wildcard DNS (`*.local.beauty.nbtech.pt` → 127.0.0.1) ou `dnsmasq`

### Neutras
- Path prefix pode coexistir como fallback para tenants em migração

## Alternativas consideradas

- **Path prefix**: rejeitado por motivos de branding e SEO
- **Custom domains por tenant (sem wildcard)**: rejeitado para fase 1 (complexidade operacional), reservado para fase 4+

## Implementação

- Traefik v3 com `*.beauty.nbtech.pt` → mesmo backend
- Let's Encrypt DNS-01 challenge (provider-agnostic via `lego`)
- Header `X-Tenant-Slug: <subdomain>` injectado pelo Traefik
- Middleware `IdentifyTenant` no `joycehairbeauty/apps/api`

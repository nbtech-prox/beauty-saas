# ADR-002: Shared schema vs schema-per-tenant

> **Estado**: ✅ Aceite
> **Data**: 2026-08-09
> **Decisor**: Beauty SaaS team
> **Contexto**: Estratégia de isolamento multi-tenant no PostgreSQL

## Contexto

Três abordagens principais para multi-tenancy em Postgres:

1. **Shared DB, shared schema com `tenant_id`** (discriminator column)
2. **Shared DB, schema-per-tenant** (Postgres native schemas)
3. **DB-per-tenant** (database isolation)

## Decisão

**Shared DB, shared schema com `tenant_id`** + Row-Level Security (RLS) do Postgres.

## Consequências

### Positivas
- ✅ Migrations triviais (uma única DB para evoluir)
- ✅ Backups simples (um único `pg_dump`)
- ✅ Cross-tenant analytics trivial (queries agregadas sem FEDERATED)
- ✅ Custo de infra previsível
- ✅ RLS dá defesa em profundidade ao nível da DB

### Negativas
- ⚠️ "Noisy neighbour": 1 tenant com queries pesadas afecta os outros (mitigado com connection pool por tenant + rate limit por query)
- ⚠️ Toda a equipa TEM de se lembrar de `where tenant_id = ...` (mitigado com Global Scopes Eloquent + RLS)
- ⚠️ Limite prático ~5.000 tenants activos (largamente acima do target 24m)

### Limites revistos

Se em algum momento tivermos > 1.000 tenants activos OU > 10M rows em `appointments`, re-avaliar:
- Schema-per-tenant para os maiores 100 (enterprise tier)
- OU DB-per-tenant para o tier Business

## Alternativas consideradas

- **Schema-per-tenant**: rejeitado — operacionalmente complexo (migrations N vezes, backups N vezes, cross-tenant analytics doloroso)
- **DB-per-tenant**: rejeitado — operacionalmente caro (100+ DBs), overkill para a escala actual

## Implementação

```sql
-- Exemplo de policy RLS
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY services_tenant_isolation ON services
  USING (tenant_id = current_setting('app.tenant_id')::uuid);

-- O middleware Laravel faz: SET LOCAL app.tenant_id = '<uuid>';
```

Todas as tabelas de negócio têm:
1. Coluna `tenant_id UUID NOT NULL REFERENCES tenants(id)`
2. Índice composto `(tenant_id, id)` (tenant_id primeiro!)
3. Policy RLS activa
4. Global Scope Eloquent
5. Test Pest que valida isolamento

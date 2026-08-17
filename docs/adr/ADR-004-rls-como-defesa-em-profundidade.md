# ADR-004: RLS como camada de defesa em profundidade

> **Estado**: ✅ Aceite
> **Data**: 2026-08-09
> **Decisor**: Beauty SaaS team
> **Contexto**: Isolamento de dados entre tenants

## Contexto

Mesmo com middleware, repositories e filtros da aplicação, **bugs acontecem**. Uma query sem `tenant_id` numa nova rota, job ou operação de suporte pode expor dados cross-tenant. Para SaaS B2B, isto é **inaceitável**.

## Decisão

Adoptar **Row-Level Security (RLS)** do Postgres como **terceira camada** de defesa, abaixo do middleware (camada 1) e do Eloquent Global Scope (camada 2).

## Consequências

### Positivas

- ✅ **Bugs na camada de aplicação são contidos** ao nível da DB
- ✅ `set_config('app.tenant_id', '<uuid>', true)` dentro da transacção é suficiente — qualquer query que esqueça o filtro fica limitada pela policy
- ✅ Compliance mais simples de auditar (RLS policies são visíveis na DB)
- ✅ Funciona para queries raw (`DB::statement`), jobs assíncronos, psql ad-hoc
- ✅ Zero overhead perceptível (Postgres avalia policies com índices)

### Negativas

- ⚠️ Cada tabela precisa de policy explícita (esquecer = buraco)
- ⚠️ Migrations são mais verbosas
- ⚠️ Superuser (postgres) bypassa RLS — temos de usar roles dedicados para a app
- ⚠️ Testes têm de validar RLS explicitamente (não basta testar middleware)
- ⚠️ Operações globais exigem fronteiras privilegiadas mínimas, definidas no ADR-006

### Complexidade adicional

- Cada migration nova que cria tabela de tenant deve:
  1. Adicionar coluna `tenant_id`
  2. Criar índice composto
  3. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
  4. Criar policy
- Migração de dados existente: backfill `tenant_id` em batch antes de activar RLS

## Camadas (resumo)

```
┌─────────────────────────────────────────────┐
│ Camada 1: Aplicação                         │
│ - Middleware IdentifyTenant                 │
│ - Identificação e autorização do tenant     │
│ - Policies / Gates                          │
├─────────────────────────────────────────────┤
│ Camada 2: Repository / domínio              │
│ - Queries parametrizadas                    │
│ - Validação dos contracts                   │
├─────────────────────────────────────────────┤
│ Camada 3: Database (Postgres RLS) ⭐        │
│ - set_config(app.tenant_id, ..., true)      │
│ - Policies em cada tabela                   │
├─────────────────────────────────────────────┤
│ Camada 4: Infra (rede, secrets, IAM)        │
│ - VPC privada para Postgres                 │
│ - Credenciais rotacionadas                  │
└─────────────────────────────────────────────┘
```

## Implementação

```sql
-- 1. Não definir um tenant global na base de dados.
--    O contexto existe apenas dentro da transacção da operação.

-- 2. Em cada tabela de tenant
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE services FORCE ROW LEVEL SECURITY;

CREATE POLICY services_tenant_isolation ON services
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
  );

-- 3. Na mesma transacção da operação
SELECT set_config('app.tenant_id', $1, true);
```

## Testes obrigatórios

Para cada tabela com `tenant_id`:

```php
it('impede cross-tenant access mesmo com query raw', function () {
    $tenantA = Tenant::factory()->create();
    $tenantB = Tenant::factory()->create();
    $serviceA = Service::factory()->for($tenantA)->create();

    DB::statement("SET LOCAL app.tenant_id = ?", [$tenantB->id]);

    expect(DB::table('services')->where('id', $serviceA->id)->first())->toBeNull();
});
```

## Alternativas consideradas

- **Apenas middleware + scopes** (sem RLS): rejeitado — defesa de profundidade é princípio
- **RLS com Vault (HashiCorp) para segredos por tenant**: overkill para a escala actual

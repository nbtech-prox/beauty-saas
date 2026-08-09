# ADR-004: RLS como camada de defesa em profundidade

> **Estado**: ✅ Aceite
> **Data**: 2026-08-09
> **Decisor**: Beauty SaaS team
> **Contexto**: Isolamento de dados entre tenants

## Contexto

Mesmo com middleware e Global Scopes Eloquent, **bugs acontecem**. Um `Service::all()` sem scope activo (numa nova rota, num job, numa query de debug) pode expor dados cross-tenant. Para SaaS B2B, isto é **inaceitável**.

## Decisão

Adoptar **Row-Level Security (RLS)** do Postgres como **terceira camada** de defesa, abaixo do middleware (camada 1) e do Eloquent Global Scope (camada 2).

## Consequências

### Positivas
- ✅ **Bugs na camada de aplicação são contidos** ao nível da DB
- ✅ `SET LOCAL app.tenant_id = '<uuid>'` é suficiente — qualquer query que esqueça o filtro é rejeitada
- ✅ Compliance mais simples de auditar (RLS policies são visíveis na DB)
- ✅ Funciona para queries raw (`DB::statement`), jobs assíncronos, psql ad-hoc
- ✅ Zero overhead perceptível (Postgres avalia policies com índices)

### Negativas
- ⚠️ Cada tabela precisa de policy explícita (esquecer = buraco)
- ⚠️ Migrations são mais verbosas
- ⚠️ Superuser (postgres) bypassa RLS — temos de usar roles dedicados para a app
- ⚠️ Testes têm de validar RLS explicitamente (não basta testar middleware)

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
│ - Eloquent Global Scopes                    │
│ - Policies / Gates                          │
├─────────────────────────────────────────────┤
│ Camada 2: ORM (Eloquent)                    │
│ - Boot do Model com scope automático        │
│ - Validação em Form Requests                │
├─────────────────────────────────────────────┤
│ Camada 3: Database (Postgres RLS) ⭐        │
│ - SET LOCAL app.tenant_id                   │
│ - Policies em cada tabela                   │
├─────────────────────────────────────────────┤
│ Camada 4: Infra (rede, secrets, IAM)        │
│ - VPC privada para Postgres                 │
│ - Credenciais rotacionadas                  │
└─────────────────────────────────────────────┘
```

## Implementação

```sql
-- 1. Setup (uma vez)
ALTER DATABASE joyce_hair_beauty SET app.tenant_id = '';

-- 2. Em cada tabela de tenant
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY services_tenant_isolation ON services
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 3. No middleware Laravel
DB::statement("SET LOCAL app.tenant_id = ?", [$tenant->id]);
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

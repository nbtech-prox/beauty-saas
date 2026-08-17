# ADR-006: Fronteiras de privilégios PostgreSQL

> **Estado**: ✅ Aceite
> **Data**: 2026-08-15
> **Decisor**: Beauty SaaS team
> **Contexto**: roles de runtime, migrations, webhooks e operações cross-tenant

## Contexto

O ADR-004 exige Row-Level Security como defesa em profundidade para dados de tenant. A primeira migration confirmou que `FORCE ROW LEVEL SECURITY` também se aplica ao owner da tabela e que testes executados como `postgres` podem esconder bloqueios de produção.

O control plane precisa, porém, de operações com âmbitos diferentes:

- requests normais limitados a um tenant;
- criação atómica de um tenant e do primeiro owner;
- recepção de eventos externos antes de o tenant ser conhecido;
- processamento de webhooks já correlacionados com um tenant;
- consultas administrativas cross-tenant;
- aplicação de migrations.

Uma única credencial com `SUPERUSER` ou `BYPASSRLS` eliminaria a defesa pretendida. Um custom GUC como `app.is_admin = true` também não é uma fronteira de autorização: qualquer sessão com acesso SQL pode definir custom settings.

## Decisão

Separar privilégios por credencial e manter as credenciais das aplicações como `NOSUPERUSER` e `NOBYPASSRLS`.

### Roles conceptuais

| Role                    | Login | BYPASSRLS | Responsabilidade                                                     |
| ----------------------- | ----- | --------- | -------------------------------------------------------------------- |
| `beauty_migrator`       | sim   | não       | aplicar migrations e gerir DDL autorizado                            |
| `beauty_runtime`        | sim   | não       | requests tenant-scoped após `SET LOCAL app.tenant_id`                |
| `beauty_provisioner`    | sim   | não       | criar tenant + owner com UUID/contexto definidos na mesma transacção |
| `beauty_webhook`        | sim   | não       | invocar API SQL limitada de ingestão/processamento de eventos        |
| `beauty_platform_admin` | sim   | não       | invocar API SQL limitada para operações administrativas cross-tenant |
| `beauty_rls_owner`      | não   | sim       | possuir apenas funções privilegiadas e objectos que as exigem        |

Os nomes são contratos lógicos. A criação e rotação efectiva das roles pode ser feita pela infra gerida; as migrations devem aplicar `GRANT`/`REVOKE` apenas quando as roles existirem ou através de bootstrap explícito.

### Operações tenant-scoped

1. A aplicação inicia uma transacção.
2. Valida o tenant como UUID.
3. Executa `set_config('app.tenant_id', tenantId, true)`.
4. Executa queries parametrizadas.
5. Faz commit ou rollback.

O provisioning gera o UUID antes do primeiro insert e usa esse mesmo valor como contexto RLS. Não requer `BYPASSRLS` nem função privilegiada.

### Operações globais inevitáveis

Ingestão inicial de webhook sem tenant e operações cross-tenant usam funções `SECURITY DEFINER` mínimas, nunca acesso directo irrestrito às tabelas.

Cada função privilegiada deve:

- pertencer a `beauty_rls_owner`, role `NOLOGIN`;
- ter `search_path` fixo e usar nomes de objectos schema-qualified;
- receber apenas parâmetros tipados e validados;
- evitar SQL dinâmico;
- revogar `EXECUTE` de `PUBLIC`;
- conceder `EXECUTE` somente à role de serviço necessária;
- devolver uma allowlist de colunas, nunca `SELECT *`;
- ser coberta por testes positivos e negativos com a role real;
- escrever audit log quando produzir efeito de negócio.

`beauty_webhook` não pode fazer `SET ROLE beauty_rls_owner` nem consultar livremente dados de outros tenants. Pode apenas executar as funções específicas de ingestão e processamento concedidas.

### Tabelas e RLS

- Tabelas com `tenant_id` usam `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`.
- Policies tenant-scoped são fail-closed quando `app.tenant_id` está ausente ou inválido.
- Linhas operacionais ainda não correlacionadas com tenant não recebem uma policy pública permissiva; só são acessíveis pelas funções privilegiadas específicas.
- Tabelas puramente globais devem ter grants explícitos e uma justificação documentada. A ausência de `tenant_id` não implica acesso para `PUBLIC`.

### Credenciais

- `DATABASE_URL` representa runtime tenant-scoped.
- Migrations usam uma credencial separada, prevista como `DATABASE_MIGRATION_URL`.
- Webhook e platform-admin usam credenciais distintas quando forem activados.
- Nenhuma connection string é enviada ao browser, registada em logs ou partilhada entre ambientes.

O CLI de migrations exige `DATABASE_MIGRATION_URL` e não faz fallback para `DATABASE_URL`.

## Invariantes

1. Nenhuma role `LOGIN` da aplicação tem `SUPERUSER` ou `BYPASSRLS`.
2. Nenhuma role de aplicação pode tornar-se `beauty_rls_owner`.
3. Custom GUCs identificam contexto; não concedem privilégio global.
4. Toda operação cross-tenant possui uma função ou interface SQL allowlisted.
5. Migrations nunca são executadas com a credencial runtime em produção.
6. Testes de integração autenticam directamente com roles equivalentes às de produção.
7. O platform-admin continua a exigir autenticação/RBAC na aplicação; a função SQL limita capacidade, não substitui autorização.

## Consequências

### Positivas

- Uma credencial runtime comprometida continua limitada por RLS.
- Provisioning e webhooks deixam de depender de superuser.
- Operações globais tornam-se pequenas, auditáveis e testáveis.
- Migrations e runtime deixam de partilhar poder DDL.

### Negativas

- Mais credenciais e rotação operacional.
- Funções `SECURITY DEFINER` exigem revisão de segurança rigorosa.
- Testes de integração precisam de preparar roles e grants.
- O deploy tem um passo explícito de bootstrap de privilégios.

### Neutras

- O número de Pools pode aumentar por processo, mas cada aplicação só configura os necessários.
- O PostgreSQL gerido pode exigir adaptação dos nomes/grants ao provider.

## Alternativas rejeitadas

### Uma role com `BYPASSRLS`

Rejeitada. Um bug de query ou comprometimento da aplicação teria leitura/escrita cross-tenant irrestrita.

### Usar `postgres` em runtime

Rejeitada. Superuser ignora RLS e torna os testes de isolamento enganadores.

### Policy baseada em `app.is_admin = true`

Rejeitada. Custom settings não são uma fronteira de privilégio por si só.

### Remover `FORCE RLS`

Rejeitada. O owner da tabela passaria a ignorar as policies e o comportamento dependeria acidentalmente de quem criou a migration.

## Implementação incremental

1. Manter o teste de provisioning com role `LOGIN NOSUPERUSER NOBYPASSRLS`.
2. Separar `DATABASE_MIGRATION_URL` de `DATABASE_URL` no CLI/configuração.
3. Criar roles de teste equivalentes para webhook e platform-admin.
4. Criar funções privilegiadas apenas quando o primeiro caso real exigir.
5. Provar que a role autorizada consegue executar a função e que runtime/`PUBLIC` não conseguem.
6. Documentar bootstrap, rotação e rollback operacional antes do primeiro deploy.

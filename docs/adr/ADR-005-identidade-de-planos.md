# ADR-005: Identidade de planos por código canónico

> **Estado**: ✅ Aceite
> **Data**: 2026-08-15
> **Decisor**: Beauty SaaS team
> **Contexto**: identidade persistida de planos e subscriptions no control plane

## Contexto

A implementação actual possui duas representações incompatíveis:

- `packages/billing` define o catálogo comercial num registry estático, identificado por códigos estáveis como `pro-monthly`;
- `packages/contracts/src/subscription.ts` exige `planId` como UUID, apesar de não existir tabela, repository ou lifecycle persistido de `plans`;
- `TenantCreateInputSchema` já recebe o valor comercial `pro-monthly`, embora o campo ainda se chame `planId`;
- Checkout e metadata Stripe reconciliam o plano pelo código público.

Criar UUIDs sem uma entidade persistida introduziria uma identidade artificial e obrigaria a sincronizar três fontes: base de dados, registry TypeScript e Stripe.

## Decisão

Na Fase 1, o catálogo em `packages/billing` é a fonte canónica dos planos e a identidade persistida é `plan_code`.

- O código público segue o formato slug, por exemplo `starter-monthly` ou `pro-yearly`.
- Contracts e inputs usam `planCode`, validado pelo conjunto canónico `PLAN_CODES`.
- A tabela `subscriptions` guarda `plan_code`, e não `plan_id` UUID.
- A subscription guarda também os identificadores externos Stripe necessários à reconciliação, incluindo Subscription, Customer e Price.
- Não existe tabela `plans` na Fase 1.
- Alterar preços não altera o código de uma subscrição existente. Um novo preço Stripe pode ser associado ao mesmo código quando a regra comercial permitir; o histórico financeiro permanece no Stripe e nos identificadores persistidos.

O código é identidade interna estável. O Stripe Price ID é identidade do provider e nunca substitui `plan_code` nos contratos do domínio.

## Invariantes

1. `plan_code` é obrigatório e segue `^[a-z0-9-]+$`.
2. Apenas códigos presentes em `PLAN_CODES` podem entrar através das fronteiras TypeScript.
3. Checkout escreve o mesmo código na Session, Subscription e persistência local.
4. Webhooks desconhecidos ou com código não reconhecido não activam o tenant silenciosamente.
5. `stripe_price_id` é persistido para auditoria e reconciliação.
6. Renomear ou remover um código exige migration de dados e compatibilidade explícita; não é uma simples alteração visual.

## Consequências

### Positivas

- Uma única identidade atravessa landing, onboarding, Checkout, webhooks e base de dados.
- Elimina UUIDs de plano sem entidade correspondente.
- Evita sincronização obrigatória de uma tabela `plans` com o registry TypeScript.
- Facilita leitura operacional e diagnóstico de eventos Stripe.
- Mantém o control plane independente dos IDs específicos de cada ambiente Stripe.

### Negativas

- A integridade do conjunto exacto de códigos é garantida pela aplicação, não por foreign key.
- A remoção de códigos exige disciplina de compatibilidade.
- Consultas históricas que precisem da configuração comercial completa não podem depender apenas do registry actual.

### Neutras

- Stripe continua a ser a fonte do histórico financeiro e das invoices.
- Uma tabela `plans` poderá ser introduzida futuramente se existir edição dinâmica de catálogo no platform-admin.

## Alternativas consideradas

### Tabela `plans` com UUID

Rejeitada para a Fase 1. Acrescenta sincronização, migrations e um lifecycle administrativo que ainda não existe. Só deve ser reconsiderada quando os planos forem editáveis em runtime.

### Usar apenas Stripe Price ID

Rejeitada. Price IDs variam entre test/live, pertencem ao provider e podem mudar numa evolução de preço. Não são uma identidade de domínio estável.

### Manter simultaneamente `planId` e `planCode`

Rejeitada. Duplica a identidade sem uma regra útil de autoridade e permite divergências.

## Implementação

1. Exportar um `PlanCodeSchema` canónico em `packages/contracts`.
2. Evoluir `TenantCreateInputSchema` e `SubscriptionCreateInputSchema` de `planId` para `planCode`.
3. Evoluir `SubscriptionSchema` para devolver `planCode`.
4. Criar `subscriptions.plan_code` na migration PostgreSQL.
5. Persistir `stripe_price_id`, `external_id` e `external_customer_id` separadamente.
6. Validar e reconciliar o código em todos os handlers de webhook conhecidos.
7. Actualizar documentação e testes no mesmo incremento.

Como ainda não existe API pública da Fase 1 nem dados persistidos de subscriptions, esta evolução é feita antes do primeiro contract estável. Se surgir um consumidor externo antes da alteração, deverá ser aplicada uma janela de compatibilidade `planId` → `planCode` em vez de remoção imediata.

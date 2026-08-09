# ADR-003: Stripe vs Paddle

> **Estado**: ✅ Aceite
> **Data**: 2026-08-09
> **Decisor**: Beauty SaaS team
> **Contexto**: Processador de pagamentos para SaaS

## Contexto

Duas opções principais para billing recorrente de SaaS:

1. **Stripe** — Merchant of Record próprio, máximo controlo
2. **Paddle** — Merchant of Record (eles tratam de impostos, faturação global)

## Decisão

**Stripe** para fase 1-3. Re-avaliar para Paddle se:
- Operarmos em > 30 países (Paddle simplifica imposto global)
- O custo de compliance fiscal ultrapassar 5% do revenue
- O tempo gasto em faturação/invoices for > 5h/mês

## Consequências

### Positivas (Stripe)
- ✅ Customer Portal pronto a usar (sem construir UI de billing)
- ✅ Webhooks robustos e bem documentados
- ✅ Stripe Tax (se activarmos) calcula IVA automaticamente por país
- ✅ Invoicing customizável
- ✅ Stripe SDK oficial para Node (`stripe-node` 19.x)
- ✅ Test mode completo com cards de teste
- ✅ Boa documentação para disputas/refunds

### Negativas (Stripe)
- ⚠️ Somos Merchant of Record → responsabilidade fiscal em cada país
- ⚠️ Compliance PCI: gerir SAQ A se usarmos Stripe Elements (mínimo atrito)
- ⚠️ Disputas exigem resposta manual (Paddle trata parcialmente)

### Negativas (Paddle — porque não)
- ⚠️ Menos flexível em pricing tiers dinâmicos
- ⚠️ Fee ligeiramente mais alto (~5% vs ~2.9% + 0.30€)
- ⚠️ Menos controlo sobre UX de checkout
- ⚠️ Vendor lock-in maior (migrar de Paddle é doloroso)

## Alternativas consideradas

- **Paddle Billing (MoR)**: rejeitado pelos motivos acima
- **LemonSqueezy**: rejeitado — mais focado em digital goods, menos em SaaS
- **Chargebee / Recurly**: rejeitado — overkill e mais uma integração

## Implementação

- `packages/billing` com wrapper Stripe
- Webhook receiver idempotente em `apps/platform-admin/api/webhooks/stripe`
- Eventos processados: `customer.subscription.*`, `invoice.*`, `checkout.session.completed`
- Planos criados via Stripe Dashboard OU via script `pnpm billing:sync-plans`
- Testes com `stripe trigger <event>` (Stripe CLI)

/**
 * Página de catálogo de planos — consome `listPublicPlans()` do billing.
 *
 * Server Component. Sem fetch — lê do registry em memória.
 * É o "primeiro ecrã" que prova que `@beauty-saas/billing` está wired.
 */
import { listPublicPlans } from '@beauty-saas/billing/plans';
import { PlanCard } from '@/components/PlanCard';

export const metadata = {
  title: 'Planos — beauty.saas',
};

export default function PlanosPage() {
  const plans = listPublicPlans();

  return (
    <main className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-bold">Planos comerciais</h1>
        <p className="mt-2 text-zinc-600">
          {plans.length} planos activos no registry · preços sincronizados com Stripe via env vars.
        </p>
      </header>

      <section
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="plan-grid"
      >
        {plans.map((plan) => (
          <PlanCard key={plan.code} plan={plan} />
        ))}
      </section>

      <footer className="mt-12 rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-500">
        <strong>Fonte:</strong> <code className="rounded bg-zinc-100 px-1.5 py-0.5">PLAN_DEFINITIONS</code> em <code>@beauty-saas/billing/plans</code>.
        O mapeamento para Stripe Price IDs vem de <code className="rounded bg-zinc-100 px-1.5 py-0.5">STRIPE_PRICE_*</code> (env).
      </footer>
    </main>
  );
}
/**
 * Página pública de preços.
 *
 * Server Component. Mostra 3 planos principais + Pro destacado, todos
 * a partir de `publicPlans` (já filtrado por `isPublic`).
 *
 * Os planos anuais são excluídos aqui para manter a página concisa;
 * o utilizador pode navegar para `/planos/[code]` para ver variantes
 * mensais/anuais e detalhes.
 */
import { PricingCard } from '@/components/PricingCard';
import { publicPlans } from '@/lib/plans';

export const metadata = {
  title: 'Preços — Beauty SaaS',
  description: 'Planos Starter, Pro e Enterprise para salões de beleza.',
};

/** Quantos planos apresentar na página principal de preços. */
const HOMEPAGE_PLAN_LIMIT = 4;

export default function PrecosPage() {
  const featured = publicPlans.slice(0, HOMEPAGE_PLAN_LIMIT);

  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Preços</h1>
        <p className="mx-auto mt-4 max-w-2xl text-slate-600">
          Escolhe o plano que cresce com o teu salão. Sem fidelização, sem
          surpresas.
        </p>
      </header>

      <section
        className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
        data-testid="pricing-grid"
      >
        {featured.map((plan) => (
          <PricingCard
            key={plan.code}
            plan={plan}
            href={`/criar?plan=${plan.code}`}
            ctaLabel={plan.tier === 'pro' ? 'Experimentar Pro' : 'Começar'}
          />
        ))}
      </section>
    </main>
  );
}

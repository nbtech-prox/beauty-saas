/**
 * Página de detalhe de um plano público.
 *
 * Server Component. Lê o `code` do path, resolve via `getPlanByCode`,
 * e faz `notFound()` se for desconhecido. Mostra o plano + CTA para
 * `/criar?plan={code}`.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPlanByCode } from '@beauty-saas/billing/plans';
import { formatPriceEUR, formatPlanInterval } from '@/lib/plans';

interface PageProps {
  readonly params: Promise<{ readonly code: string }>;
}

export default async function PlanoDetailPage({ params }: PageProps) {
  const { code } = await params;

  let plan;
  try {
    plan = getPlanByCode(code);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <article
        data-testid={`plan-detail-${plan.code}`}
        className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <header className="mb-6">
          <h1 className="text-3xl font-bold">{plan.name}</h1>
          <p className="mt-1 text-sm uppercase tracking-wide text-slate-500">
            Plano {plan.tier} — {formatPlanInterval(plan.interval)}
          </p>
        </header>

        <div className="mb-8">
          <p className="text-5xl font-bold">
            {formatPriceEUR(plan.priceCents)}
          </p>
          <p className="text-sm text-slate-500">
            {formatPlanInterval(plan.interval)}
          </p>
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Inclui
        </h2>
        <ul className="mb-8 space-y-2 text-sm">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <span className="text-emerald-600" aria-hidden="true">
                ✓
              </span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <Link
          href={`/criar?plan=${plan.code}`}
          className="block w-full rounded-lg bg-slate-900 px-6 py-3 text-center text-sm font-semibold text-white hover:bg-slate-800"
        >
          Começar
        </Link>
      </article>
    </main>
  );
}

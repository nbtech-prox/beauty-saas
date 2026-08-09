/**
 * Página de detalhes de um plano + form de checkout.
 *
 * Server Component. Renderiza os detalhes do plano (server-side) e
 * embute o <CheckoutForm /> (client component) para interacção.
 *
 * /planos/[code] é estático por code — geramos páginas para os 6 planos
 * canónicos no `generateStaticParams`.
 */
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  PLAN_CODES,
} from '@beauty-saas/contracts';
import {
  tryGetPlanByCode,
  type PlanDefinition,
} from '@beauty-saas/billing/plans';
import { formatInterval, formatPriceCents } from '@/lib/format';
import { CheckoutForm } from '@/components/CheckoutForm';

const FEATURE_LABELS: Readonly<Record<string, string>> = {
  multi_location: 'Múltiplas localizações',
  custom_domain: 'Domínio personalizado',
  white_label: 'White-label',
  priority_support: 'Suporte prioritário',
  sso_saml: 'SSO / SAML',
  api_access: 'Acesso à API',
  advanced_reports: 'Relatórios avançados',
};

const TIER_ACCENT: Readonly<Record<string, string>> = {
  starter: 'border-zinc-300 bg-white',
  pro: 'border-zinc-900 bg-zinc-50',
  enterprise: 'border-amber-500 bg-amber-50',
};

const TIER_BADGE: Readonly<Record<string, string>> = {
  starter: 'bg-zinc-100 text-zinc-700',
  pro: 'bg-zinc-900 text-white',
  enterprise: 'bg-amber-500 text-white',
};

/**
 * Gera páginas estáticas para os 6 planos canónicos em build time.
 * Outros codes (legacy, internos) caem no notFound().
 */
export function generateStaticParams(): readonly { code: string }[] {
  return Object.values(PLAN_CODES).map((code) => ({ code }));
}

interface PageProps {
  readonly params: Promise<{ readonly code: string }>;
}

export default async function PlanoDetailPage({ params }: PageProps) {
  const { code } = await params;
  const plan = tryGetPlanByCode(code);
  if (!plan) {
    notFound();
  }

  return (
    <PlanDetailLayout plan={plan}>
      <CheckoutForm
        planCode={plan.code}
        planName={plan.name}
        priceLabel={`${formatPriceCents(plan.priceCents)} ${formatInterval(plan.interval)}`}
      />
    </PlanDetailLayout>
  );
}

function PlanDetailLayout({
  plan,
  children,
}: {
  readonly plan: PlanDefinition;
  readonly children: React.ReactNode;
}) {
  const accent = TIER_ACCENT[plan.tier] ?? 'border-zinc-300 bg-white';
  const badge = TIER_BADGE[plan.tier] ?? 'bg-zinc-100 text-zinc-700';
  const intervalLabel = formatInterval(plan.interval);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <nav className="mb-6 text-sm text-zinc-500">
        <Link href="/planos" className="hover:text-zinc-900 hover:underline">
          ← Catálogo de planos
        </Link>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[2fr_3fr]">
        <article
          data-testid={`plan-detail-${plan.code}`}
          className={`rounded-2xl border-2 p-6 shadow-sm ${accent}`}
        >
          <header className="mb-4 flex items-center justify-between">
            <h1 className="text-2xl font-semibold">{plan.name}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase ${badge}`}>
              {plan.tier}
            </span>
          </header>

          <div className="mb-6">
            <p className="text-4xl font-bold">{formatPriceCents(plan.priceCents)}</p>
            <p className="text-sm text-zinc-500">{intervalLabel}</p>
          </div>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Inclui
          </h2>
          <ul className="mb-6 space-y-1.5 text-sm">
            {plan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <span className="text-emerald-600" aria-hidden="true">
                  ✓
                </span>
                <span>{FEATURE_LABELS[feature] ?? feature}</span>
              </li>
            ))}
          </ul>

          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Quotas
          </h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <QuotaItem label="Profissionais" limit={plan.limits.maxProfessionals} />
            <QuotaItem label="Serviços" limit={plan.limits.maxServices} />
            <QuotaItem
              label="Agendamentos/mês"
              limit={plan.limits.maxBookingsPerMonth}
            />
            <QuotaItem label="Localizações" limit={plan.limits.maxLocations} />
          </dl>
        </article>

        <aside className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold">Subscrever</h2>
          <p className="mb-6 text-sm text-zinc-600">
            Stripe recolhe o pagamento de forma segura. Não guardamos dados de cartão.
          </p>
          {children}
        </aside>
      </div>
    </main>
  );
}

function QuotaItem({
  label,
  limit,
}: {
  readonly label: string;
  readonly limit: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-semibold">{limit}</dd>
    </div>
  );
}
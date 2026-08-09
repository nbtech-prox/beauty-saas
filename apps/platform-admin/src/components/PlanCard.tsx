/**
 * PlanCard — cartão visual de um plano.
 *
 * Server Component (sem 'use client') — recebe props serializáveis e
 * renderiza HTML puro. Não há interacção do lado do cliente além do link.
 */
import Link from 'next/link';
import type { PlanDefinition } from '@beauty-saas/billing/plans';
import { formatInterval, formatPriceCents } from '@/lib/format';

interface PlanCardProps {
  readonly plan: PlanDefinition;
}

/**
 * Labels legíveis para as features (UI copy — não são contratos).
 */
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

export function PlanCard({ plan }: PlanCardProps) {
  const accent = TIER_ACCENT[plan.tier] ?? 'border-zinc-300 bg-white';
  const badge = TIER_BADGE[plan.tier] ?? 'bg-zinc-100 text-zinc-700';
  const intervalLabel = formatInterval(plan.interval);

  return (
    <article
      data-testid={`plan-card-${plan.code}`}
      className={`flex flex-col rounded-2xl border-2 p-6 shadow-sm ${accent}`}
    >
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{plan.name}</h2>
        <span className={`rounded-full px-3 py-1 text-xs font-medium uppercase ${badge}`}>
          {plan.tier}
        </span>
      </header>

      <div className="mb-6">
        <p className="text-4xl font-bold" data-testid={`plan-price-${plan.code}`}>
          {formatPriceCents(plan.priceCents)}
        </p>
        <p className="text-sm text-zinc-500">{intervalLabel}</p>
      </div>

      <dl className="mb-6 grid grid-cols-2 gap-3 text-sm">
        <QuotaItem label="Profissionais" limit={plan.limits.maxProfessionals} />
        <QuotaItem label="Serviços" limit={plan.limits.maxServices} />
        <QuotaItem label="Agendamentos/mês" limit={plan.limits.maxBookingsPerMonth} />
        <QuotaItem label="Localizações" limit={plan.limits.maxLocations} />
      </dl>

      <div className="mb-6">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Inclui
        </h3>
        <ul className="space-y-1.5 text-sm">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <span className="text-emerald-600" aria-hidden="true">✓</span>
              <span>{FEATURE_LABELS[feature] ?? feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <footer className="mt-auto">
        <Link
          href={`/planos/${plan.code}`}
          className="block w-full rounded-lg bg-zinc-900 px-4 py-3 text-center text-sm font-medium text-white transition hover:bg-zinc-700"
        >
          Escolher {plan.name}
        </Link>
      </footer>
    </article>
  );
}

function QuotaItem({ label, limit }: { readonly label: string; readonly limit: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="font-semibold">{limit}</dd>
    </div>
  );
}
/**
 * PricingCard — cartão público para apresentar um plano comercial.
 *
 * Render: nome, preço formatado, intervalo, lista de features e CTA.
 * Server-component puro — sem estado, sem effects.
 */
import Link from 'next/link';
import type { PlanFeature } from '@beauty-saas/contracts';
import type { PlanDefinition } from '@beauty-saas/billing/plans';
import { formatPriceEUR, formatPlanInterval } from '@/lib/plans';

const FEATURE_LABELS: Readonly<Record<PlanFeature, string>> = {
  multi_location: 'Múltiplas localizações',
  custom_domain: 'Domínio personalizado',
  white_label: 'White-label',
  priority_support: 'Suporte prioritário',
  sso_saml: 'SSO / SAML',
  api_access: 'Acesso à API',
  advanced_reports: 'Relatórios avançados',
};

export interface PricingCardProps {
  readonly plan: PlanDefinition;
  readonly href: string;
  readonly ctaLabel?: string;
}

export function PricingCard({
  plan,
  href,
  ctaLabel = 'Começar',
}: PricingCardProps) {
  const isHighlighted = plan.tier === 'pro';
  const cardClasses = isHighlighted
    ? 'rounded-2xl border-2 border-slate-900 bg-slate-900 p-6 shadow-lg text-white'
    : 'rounded-2xl border border-slate-200 bg-white p-6 shadow-sm';

  const ctaClasses = isHighlighted
    ? 'block w-full rounded-lg bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-900 hover:bg-slate-100'
    : 'block w-full rounded-lg bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-slate-800';

  return (
    <article data-testid={`pricing-card-${plan.code}`} className={cardClasses}>
      <header className="mb-4">
        <h3 className="text-lg font-semibold">{plan.name}</h3>
        <p
          className={
            isHighlighted
              ? 'mt-1 text-sm text-slate-300'
              : 'mt-1 text-sm text-slate-500'
          }
        >
          Plano {plan.tier}
        </p>
      </header>

      <div className="mb-6">
        <p className="text-4xl font-bold">{formatPriceEUR(plan.priceCents)}</p>
        <p
          className={
            isHighlighted ? 'text-sm text-slate-300' : 'text-sm text-slate-500'
          }
        >
          {formatPlanInterval(plan.interval)}
        </p>
      </div>

      <ul className="mb-6 space-y-1.5 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <span
              className={
                isHighlighted ? 'text-emerald-300' : 'text-emerald-600'
              }
              aria-hidden="true"
            >
              ✓
            </span>
            <span>{FEATURE_LABELS[feature]}</span>
          </li>
        ))}
      </ul>

      <Link href={href} className={ctaClasses} data-cta="pricing">
        {ctaLabel}
      </Link>
    </article>
  );
}

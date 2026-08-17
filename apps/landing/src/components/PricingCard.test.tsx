import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PricingCard } from './PricingCard.js';
import type { PlanDefinition } from '@beauty-saas/billing/plans';

const SAMPLE_PLAN: PlanDefinition = {
  code: 'pro-monthly',
  name: 'Pro Mensal',
  tier: 'pro',
  interval: 'monthly',
  priceCents: 4900,
  currency: 'EUR',
  features: ['multi_location', 'api_access'],
  limits: {
    maxProfessionals: 10,
    maxServices: 100,
    maxBookingsPerMonth: 2000,
    maxLocations: 3,
  },
  sortOrder: 20,
  isPublic: true,
  stripePriceEnvVar: 'STRIPE_PRICE_PRO_MONTHLY',
};

describe('PricingCard', () => {
  it('renderiza o nome do plano como título', () => {
    const html = renderToStaticMarkup(
      <PricingCard plan={SAMPLE_PLAN} href="/criar?plan=pro-monthly" />,
    );
    expect(html).toContain('Pro Mensal');
  });

  it('renderiza o preço formatado em euros', () => {
    const html = renderToStaticMarkup(
      <PricingCard plan={SAMPLE_PLAN} href="/criar?plan=pro-monthly" />,
    );
    // Intl.NumberFormat pt-PT → "49,00 €"
    expect(html).toMatch(/49,00/);
  });

  it('renderiza a etiqueta de intervalo de cobrança', () => {
    const html = renderToStaticMarkup(
      <PricingCard plan={SAMPLE_PLAN} href="/criar?plan=pro-monthly" />,
    );
    expect(html).toContain('por mês');
  });

  it('renderiza a lista de features', () => {
    const html = renderToStaticMarkup(
      <PricingCard plan={SAMPLE_PLAN} href="/criar?plan=pro-monthly" />,
    );
    expect(html).toContain('Múltiplas localizações');
    expect(html).toContain('Acesso à API');
  });

  it('renderiza o botão CTA com o href correcto', () => {
    const html = renderToStaticMarkup(
      <PricingCard plan={SAMPLE_PLAN} href="/criar?plan=pro-monthly" />,
    );
    expect(html).toContain('href="/criar?plan=pro-monthly"');
  });

  it('aceita ctaLabel customizado', () => {
    const html = renderToStaticMarkup(
      <PricingCard
        plan={SAMPLE_PLAN}
        href="/criar"
        ctaLabel="Experimentar grátis"
      />,
    );
    expect(html).toContain('Experimentar grátis');
  });
});

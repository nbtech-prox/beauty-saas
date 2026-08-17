/**
 * Helpers de formatação para a UI — pt-PT exclusivo.
 *
 * Centraliza Intl.NumberFormat para que toda a app use a mesma moeda
 * (EUR) e o mesmo locale (pt-PT), e para evitar drift entre componentes.
 */

const EUR_FORMATTER = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formata um valor em cêntimos (ex.: 4900) como euros (ex.: "49,00 €").
 * Aceita input validado — não faz parsing de vírgulas/pontos.
 */
export function formatPriceCents(cents: number): string {
  return EUR_FORMATTER.format(cents / 100);
}

/**
 * Label de intervalo — "por mês" / "por ano".
 */
export function formatInterval(interval: 'monthly' | 'yearly'): string {
  return interval === 'monthly' ? 'por mês' : 'por ano';
}

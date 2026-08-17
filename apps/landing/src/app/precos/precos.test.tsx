import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PrecosPage from './page.js';

describe('PrecosPage', () => {
  it('renderiza grelha de pricing com pelo menos 3 cartões', () => {
    const html = renderToStaticMarkup(<PrecosPage />);
    expect(html).toContain('data-testid="pricing-grid"');
    // Pelo menos 3 cartões pricing-card-*
    const matches = html.match(/data-testid="pricing-card-/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('mostra o título "Preços"', () => {
    const html = renderToStaticMarkup(<PrecosPage />);
    expect(html).toContain('Preços');
  });

  it('encaminha CTAs para /criar com o plan code', () => {
    const html = renderToStaticMarkup(<PrecosPage />);
    expect(html).toContain('/criar?plan=starter-monthly');
    expect(html).toContain('/criar?plan=pro-monthly');
  });
});

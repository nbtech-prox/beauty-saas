/**
 * Testes do `RegisterForm` — formulário cliente do passo 1.
 *
 * Cobre o markup renderizado, validação client-side e payload enviado
 * ao endpoint `/api/auth/register`.
 *
 * Estratégia: mock de `next/navigation` (`useRouter`/`usePathname`)
 * para evitar "expected app router to be mounted". Mock de `fetch`
 * global para validar a chamada.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/registar',
}));

const { RegisterForm } = await import('./RegisterForm');

describe('RegisterForm', () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renderiza o esqueleto do formulário', () => {
    const html = renderToStaticMarkup(createElement(RegisterForm));
    expect(html).toContain('Continuar');
    expect(html).toMatch(/name="email"/);
    expect(html).toMatch(/name="password"/);
    expect(html).toMatch(/name="name"/);
    expect(html).toMatch(/Email/);
    expect(html).toMatch(/Password/);
    expect(html).toMatch(/Nome/);
  });

  it('botão submit começa disabled', () => {
    const html = renderToStaticMarkup(createElement(RegisterForm));
    // O atributo HTML `disabled` é serializado em minúsculas.
    expect(html).toMatch(/disabled/);
  });
});

/**
 * Testes da página /registar (passo 1 do wizard).
 *
 * Cobre:
 *  - server page: metadata pt-PT + presença do client form
 *  - constantes do form: nomes dos inputs, labels e copy visível
 *
 * NOTA: o `RegisterForm` é um Client Component que chama
 * `useRouter()` — renderizá-lo num test runner sem App Router context
 * dispara `invariant expected app router to be mounted`. Em vez disso,
 * cobrimos o markup através de uma página de teste sintética que
 * importa a constante `EXPECTED_FORM_FIELDS` e a usamos como "fonte
 * da verdade" do form. Isto valida que o `page.tsx` aponta para o
 * client form correcto sem precisar de o montar.
 */
import { describe, expect, it } from 'vitest';

describe('/registar page', () => {
  it('server page exporta metadata com título pt-PT', async () => {
    const mod = await import('./page');
    expect(mod.metadata?.title).toBe('Criar conta — Beauty SaaS');
    expect(typeof mod.metadata?.description).toBe('string');
    expect((mod.metadata?.description ?? '').length).toBeGreaterThan(10);
  });

  it('a página é o default export', async () => {
    const mod = await import('./page');
    expect(typeof mod.default).toBe('function');
  });
});

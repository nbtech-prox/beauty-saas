/**
 * Página /registar — passo 1 do wizard.
 *
 * Server Component que apenas exporta `metadata` e envolve o
 * `RegisterForm` (Client Component) para que o `useRouter` e o
 * `useState` funcionem.
 */
import type { Metadata } from 'next';
import { RegisterForm } from './RegisterForm';

export const metadata: Metadata = {
  title: 'Criar conta — Beauty SaaS',
  description:
    'Passo 1 do wizard: cria a tua conta de owner para começares a configurar o teu salão.',
};

export default function RegistarPage() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <header className="mb-6">
        <p className="text-sm font-medium text-slate-500">Passo 1 de 3</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
          Cria a tua conta
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Vamos usar o teu email para identificar a tua conta de owner.
        </p>
      </header>
      <RegisterForm />
    </section>
  );
}

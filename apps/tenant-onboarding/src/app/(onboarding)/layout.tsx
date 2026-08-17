/**
 * Layout do grupo (onboarding) — wizard público /registar → /salon → /plan → /ativado.
 *
 * Server Component. Sidebar/footer pt-PT mínimo e área central para os
 * passos do wizard. Não usa auth — a guarda é responsabilidade do
 * `src/middleware.ts` para routes que exigem sessão.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';

export default function OnboardingLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-slate-900">
            Beauty SaaS
          </Link>
          <span className="text-sm text-slate-500">
            Configuração inicial do teu salão
          </span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4 text-center text-xs text-slate-500">
          Beauty SaaS — Configuração inicial. Já tens conta? O login fica
          disponível após activação.
        </div>
      </footer>
    </div>
  );
}

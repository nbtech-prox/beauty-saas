/**
 * Root layout da app tenant-onboarding.
 *
 * Server Component. Define <html>, <body> e importa globals.css.
 * Locale pt-PT — onboarding é público e destinatário é o dono do
 * salão, que fala português.
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Beauty SaaS — Criar conta',
  description:
    'Cria o teu salão no Beauty SaaS em 3 passos: registo, configuração do salão e escolha de plano.',
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="pt-PT">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}

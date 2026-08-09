/**
 * Layout raiz — aplicado a todas as rotas.
 *
 * Server Component. Define <html> e <body>. Locale pt-PT por defeito.
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'beauty.saas — Painel administrativo',
  description: 'Gestão de tenants, planos e billing para a plataforma beauty.saas.',
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="pt-PT">
      <body className="min-h-screen bg-zinc-50 font-sans text-zinc-900 antialiased">
        {children}
      </body>
    </html>
  );
}
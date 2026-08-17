/**
 * Layout raiz — aplicado a todas as rotas da landing pública.
 *
 * Server Component. Define <html> e <body>. Locale pt-PT por defeito.
 */
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Beauty SaaS',
  description:
    'Plataforma SaaS para salões de beleza — marcações online, pagamentos e multi-salas.',
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="pt-PT">
      <body className="min-h-screen bg-white font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}

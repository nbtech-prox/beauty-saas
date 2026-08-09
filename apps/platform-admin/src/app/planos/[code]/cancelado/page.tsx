/**
 * Página de retorno quando o utilizador cancela o checkout no Stripe.
 *
 * Server Component. Oferece retentar ou voltar ao catálogo.
 */
import Link from 'next/link';

interface PageProps {
  readonly params: Promise<{ readonly code: string }>;
  readonly searchParams: Promise<{ readonly session_id?: string }>;
}

export const metadata = { title: 'Checkout cancelado — beauty.saas' };

export default async function CheckoutCancelPage({ params, searchParams }: PageProps) {
  const { code } = await params;
  await searchParams; // futuro: logging do session_id

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-2xl text-zinc-600">
          ×
        </div>
        <h1 className="mb-2 text-2xl font-semibold">Checkout cancelado</h1>
        <p className="mb-6 text-sm text-zinc-600">
          Não foi cobrado nada. Podes retomar a qualquer momento.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href={`/planos/${code}`}
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Tentar novamente
          </Link>
          <Link
            href="/planos"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:border-zinc-900"
          >
            Ver outros planos
          </Link>
        </div>
      </div>
    </main>
  );
}
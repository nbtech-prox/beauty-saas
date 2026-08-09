/**
 * Página de retorno após checkout Stripe com sucesso.
 *
 * Stripe redireciona o utilizador para aqui com `?session_id=cs_xxx`.
 * O webhook (em paralelo) é a source of truth — esta página é apenas UX.
 *
 * Server Component. Mostra confirmação e link para o Customer Portal.
 */
import Link from 'next/link';

interface PageProps {
  readonly searchParams: Promise<{ readonly session_id?: string }>;
}

export const metadata = { title: 'Subscrição activada — beauty.saas' };

export default async function CheckoutSuccessPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionId = params.session_id;

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <div
        data-testid="checkout-success"
        className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-2xl text-white">
          ✓
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-emerald-900">
          Subscrição confirmada
        </h1>
        <p className="mb-6 text-sm text-emerald-800">
          O Stripe está a processar o pagamento. Em poucos segundos o teu plano
          será activado.
        </p>
        {sessionId && (
          <p className="mb-6 break-all font-mono text-xs text-emerald-700/70">
            {sessionId}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Link
            href="/planos"
            className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Voltar ao catálogo
          </Link>
          <Link
            href="/portal"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:border-zinc-900"
          >
            Gerir subscrição →
          </Link>
        </div>
      </div>
    </main>
  );
}
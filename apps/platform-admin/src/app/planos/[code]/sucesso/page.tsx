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

export const metadata = { title: 'Confirmação em curso — beauty.saas' };

export default async function CheckoutSuccessPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionId = params.session_id;

  if (!sessionId) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <h1 className="mb-2 text-2xl font-semibold text-rose-950">
            Regresso de Checkout inválido
          </h1>
          <p className="mb-6 text-sm text-rose-900">
            Não foi recebida uma referência de Checkout. Volta ao catálogo e inicia o
            processo novamente.
          </p>
          <Link
            href="/planos"
            className="inline-block rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700"
          >
            Voltar ao catálogo
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <div
        data-testid="checkout-success"
        className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center"
      >
        <div
          aria-hidden="true"
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500 text-2xl text-white"
        >
          …
        </div>
        <h1 className="mb-2 text-2xl font-semibold text-amber-950">
          Confirmação em curso
        </h1>
        <p className="mb-6 text-sm text-amber-900">
          A activação está a ser confirmada pelo Stripe. Podes voltar ao catálogo
          enquanto o processamento termina.
        </p>
        {sessionId && (
          <p className="mb-6 break-all font-mono text-xs text-amber-800/70">
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
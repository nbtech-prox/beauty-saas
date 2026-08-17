/**
 * Homepage da landing pública.
 *
 * Server Component. Renderiza hero, secção de features e CTA final.
 * Sem dados dinâmicos — toda a copy é estática.
 */
import Link from 'next/link';

const FEATURES: ReadonlyArray<{
  readonly title: string;
  readonly description: string;
}> = [
  {
    title: 'Marcações online',
    description:
      'Os teus clientes marcam 24/7 pelo site. Sem telefone a tocar, sem no-shows.',
  },
  {
    title: 'Pagamentos',
    description:
      'Cobra sinal, mensalidade ou venda avulsa. Stripe integrado, sem dramas de IVA.',
  },
  {
    title: 'Multi-salas',
    description:
      'Gere várias localizações e equipas numa única conta. Permissões por salão.',
  },
];

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Plataforma SaaS para salões de beleza
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
          Marcações, pagamentos e gestão de equipa numa só plataforma pensada
          para o mercado português.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/precos"
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Ver planos
          </Link>
          <Link
            href="/criar"
            className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Criar conta
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <h2 className="text-lg font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm text-slate-600">
                {feature.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight">
          Pronto para começar?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-600">
          Começa em minutos. Sem cartão de crédito, sem compromisso.
        </p>
        <div className="mt-8">
          <Link
            href="/criar"
            className="rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Criar conta
          </Link>
        </div>
      </section>
    </main>
  );
}

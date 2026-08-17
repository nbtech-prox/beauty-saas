/**
 * Landing interna do wizard — ponto de partida `/`.
 *
 * Server Component. Apenas um botão "Continuar" que aponta para
 * `/registar`. O `metadata` aqui é partilhado com o layout raiz.
 */
import Link from 'next/link';

export default function OnboardingLandingPage() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">
        Bem-vindo ao Beauty SaaS
      </h1>
      <p className="mt-3 text-slate-600">
        Vamos configurar o teu salão em 3 passos curtos: crias a tua conta,
        defines o slug do salão, e escolhes o plano. No fim activas um trial
        gratuito de 14 dias — sem cartão.
      </p>
      <div className="mt-8">
        <Link
          href="/registar"
          className="inline-flex items-center rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          data-cta="continuar"
        >
          Continuar
        </Link>
      </div>
    </section>
  );
}

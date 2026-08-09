/**
 * Página inicial — hub de navegação.
 *
 * Server Component. Não toca em Stripe — apenas mostra links para as
 * secções funcionais.
 */
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-12">
        <h1 className="text-4xl font-bold">beauty.saas</h1>
        <p className="mt-2 text-zinc-600">Painel administrativo — control plane.</p>
      </header>

      <nav className="grid gap-4 sm:grid-cols-2">
        <NavLink
          href="/planos"
          title="Planos"
          description="Catálogo comercial sincronizado com Stripe."
        />
        <NavLink
          href="/portal"
          title="Portal de cliente"
          description="Abrir o Customer Portal Stripe para gerir uma subscrição."
        />
        <NavLink
          href="/tenants"
          title="Tenants"
          description="Lista de clientes e estado da subscrição."
          disabled
        />
        <NavLink
          href="/billing"
          title="Billing"
          description="Receita, churn e faturas Stripe."
          disabled
        />
        <NavLink
          href="/settings"
          title="Configurações"
          description="Env vars, webhooks e features flags."
          disabled
        />
      </nav>
    </main>
  );
}

function NavLink({
  href,
  title,
  description,
  disabled = false,
}: {
  readonly href: string;
  readonly title: string;
  readonly description: string;
  readonly disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-5 opacity-60">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
        <p className="mt-2 text-xs uppercase tracking-wide text-zinc-400">Em breve</p>
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-900 hover:shadow-sm"
    >
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-zinc-500">{description}</p>
    </Link>
  );
}
/**
 * Página /portal — entrada para o Customer Portal Stripe.
 *
 * O tenant insere o seu tenantId e submete para abrir o portal Stripe
 * (onde pode gerir método de pagamento, ver faturas, cancelar).
 *
 * O tenantId é gerado client-side na primeira visita e persistido em
 * localStorage; o utilizador pode vê-lo e recuperá-lo mais tarde.
 *
 * Em produção, este campo deveria vir da sessão autenticada (não user input).
 */
'use client';

import { useState, useTransition } from 'react';
import { getOrCreateTenantId } from '@/lib/tenant-id';

export default function PortalPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Gerir subscrição</h1>
        <p className="mt-2 text-zinc-600">
          Abre o portal Stripe para gerir método de pagamento, faturas e cancelar.
        </p>
      </header>
      <PortalForm />
    </main>
  );
}

function PortalForm() {
  const [tenantId, setTenantId] = useState<string>(() => getOrCreateTenantId());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch('/api/billing/portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId }),
        });

        const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };

        if (!res.ok || !body.url) {
          setError(body.error ?? `Erro ${res.status}`);
          return;
        }

        window.location.href = body.url;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro de rede');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="tenantId" className="block text-sm font-medium text-zinc-700">
          Tenant ID
        </label>
        <input
          id="tenantId"
          name="tenantId"
          type="text"
          required
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
        <p className="mt-1 text-xs text-zinc-500">
          Persistido no teu browser. Apaga os cookies para reiniciar.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isPending ? 'A abrir portal…' : 'Abrir Customer Portal'}
      </button>
    </form>
  );
}
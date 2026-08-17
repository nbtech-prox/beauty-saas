/**
 * Form de checkout — recolhe email + trial/coupon e chama /api/billing/checkout.
 *
 * Client Component. Usa `useTransition` para feedback não-bloqueante.
 */
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { PlanCode } from '@beauty-saas/contracts';
import { CheckoutFormInputSchema } from '@/lib/checkout-schema';
import { getOrCreateTenantId } from '@/lib/tenant-id';

interface CheckoutFormProps {
  readonly planCode: PlanCode;
  readonly planName: string;
  readonly priceLabel: string;
}

type FormState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'redirecting'; url: string };

export function CheckoutForm({ planCode, planName, priceLabel }: CheckoutFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({ kind: 'idle' });

  function handleSubmit(formData: FormData) {
    const raw = {
      email: String(formData.get('email') ?? '').trim(),
      trialDays: Number(formData.get('trialDays') ?? 0),
      couponCode: String(formData.get('couponCode') ?? '').trim(),
    };

    const parsed = CheckoutFormInputSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setState({ kind: 'error', message: first?.message ?? 'Dados inválidos' });
      return;
    }

    const tenantId = getOrCreateTenantId();

    startTransition(async () => {
      try {
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planCode,
            tenantId,
            ...parsed.data,
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          const message =
            typeof body.error === 'string' ? body.error : `Erro ${res.status}`;
          setState({ kind: 'error', message });
          return;
        }

        const body = (await res.json()) as { url?: string };
        if (!body.url || typeof body.url !== 'string') {
          setState({ kind: 'error', message: 'API não devolveu URL de checkout' });
          return;
        }

        // Atualizar a URL para o sessionId aparecer — ajuda debug.
        router.replace(`/planos/${planCode}?pending=1`);
        setState({ kind: 'redirecting', url: body.url });
        window.location.href = body.url;
      } catch (err) {
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : 'Erro de rede',
        });
      }
    });
  }

  const isRedirecting = state.kind === 'redirecting';
  const disabled = isPending || isRedirecting;

  return (
    <form action={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
          Email de billing
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="exemplo@empresa.pt"
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          disabled={disabled}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="trialDays" className="block text-sm font-medium text-zinc-700">
            Trial (dias)
          </label>
          <input
            id="trialDays"
            name="trialDays"
            type="number"
            min={0}
            max={90}
            defaultValue={0}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            disabled={disabled}
          />
          <p className="mt-1 text-xs text-zinc-500">0 a 90 dias. Sem cartão no trial.</p>
        </div>
        <div>
          <label htmlFor="couponCode" className="block text-sm font-medium text-zinc-700">
            Cupão <span className="text-zinc-400">(opcional)</span>
          </label>
          <input
            id="couponCode"
            name="couponCode"
            type="text"
            placeholder="LAUNCH20"
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm uppercase focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            disabled={disabled}
          />
        </div>
      </div>

      {state.kind === 'error' && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={disabled}
        className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {isRedirecting
          ? 'A redirecionar para Stripe…'
          : isPending
            ? 'A criar sessão…'
            : `Continuar para pagamento · ${priceLabel}`}
      </button>

      <p className="text-center text-xs text-zinc-500">
        Será redirecionado para <strong>Stripe</strong> para concluir o pagamento de{' '}
        <strong>{planName}</strong>.
      </p>
    </form>
  );
}
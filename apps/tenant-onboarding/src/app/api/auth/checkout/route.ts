/**
 * API Route: POST /api/auth/checkout
 *
 * Passo 3 do wizard de onboarding — cria uma Checkout Session Stripe
 * para o tenant em configuração. Devolve o URL de redirect para o
 * Stripe Checkout (hosted page) onde o owner finaliza o pagamento
 * (ou activa o trial).
 *
 * Body (JSON):
 *   { planCode, trialDays? }
 *
 * Returns:
 *   200 — { url, sessionId, mode, expiresAt }
 *   400 — body inválido (planCode desconhecido, etc.)
 *   401 — sem sessão válida
 *   502 — billing/Stripe falhou
 *
 * Variáveis de ambiente necessárias:
 *   ONBOARDING_SESSION_SECRET  — >= 32 bytes
 *   STRIPE_SECRET_KEY          — para o billing criar a sessão
 *   STRIPE_PRICE_*             — para mapear planCode → priceId
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { PlanCodeSchema } from '@beauty-saas/contracts';
import { createCheckoutSession } from '@beauty-saas/billing';
import { readSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CheckoutInputSchema = z.object({
  planCode: PlanCodeSchema,
  trialDays: z.number().int().min(0).max(60).optional(),
});

function readSessionCookie(request: Request): string | undefined {
  const raw = request.headers.get('cookie');
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === SESSION_COOKIE_NAME) return rest.join('=');
  }
  return undefined;
}

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Validar sessão.
  const cookieValue = readSessionCookie(request);
  const session = await readSession(cookieValue);
  if (!session) {
    return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });
  }

  // 2. Parse + validar body.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  const parsed = CheckoutInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? 'Dados do checkout inválidos',
      },
      { status: 400 },
    );
  }

  const { planCode, trialDays = 14 } = parsed.data;

  // 3. Criar Checkout Session via billing.
  try {
    const origin =
      request.headers.get('origin') ??
      (request.headers.get('x-forwarded-proto') && request.headers.get('host')
        ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('host')}`
        : '');
    const checkout = await createCheckoutSession({
      tenantId: session.tenantId,
      customerEmail: '', // billing rederiva do owner via webhook lookup
      planCode,
      mode: 'subscription',
      trialDays,
      successUrl: `${origin}/ativado?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/plan`,
    });

    return NextResponse.json(
      {
        url: checkout.url,
        sessionId: checkout.sessionId,
        mode: checkout.mode,
        expiresAt: checkout.expiresAt.toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[checkout] erro a criar sessão Stripe', {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Não foi possível iniciar o checkout. Tenta novamente.' },
      { status: 502 },
    );
  }
}

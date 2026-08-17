/**
 * API Route: POST /api/billing/checkout
 *
 * Cria uma Stripe Checkout Session para um tenant subscrever um plano.
 *
 * Body (JSON):
 *   { planCode, tenantId, email, trialDays?, couponCode? }
 *
 * Returns 200: { sessionId, url, expiresAt }
 * Returns 400: input inválido
 * Returns 500: erro de configuração (ex.: env vars em falta) ou Stripe
 *
 * Variáveis de ambiente necessárias:
 *   STRIPE_SECRET_KEY          — sk_test_xxx ou sk_live_xxx
 *   STRIPE_PRICE_<planCode>    — price_xxx mapeado ao plano
 *   NEXT_PUBLIC_APP_URL        — base URL da app (para success/cancel URLs)
 *
 * IMPORTANTE: este endpoint é público por agora (sem auth). Em produção,
 * adicionar verificação de super-admin via session middleware.
 */
import { NextResponse } from 'next/server';
import {
  type PlanCode,
  PLAN_CODES,
  UuidSchema,
} from '@beauty-saas/contracts';
import {
  createCheckoutSession,
  PromotionCodeNotFoundError,
  SubscriptionConfigError,
  StripeConfigError,
} from '@beauty-saas/billing';
import { CheckoutFormInputSchema } from '@/lib/checkout-schema';

const PLAN_CODE_SET = new Set<string>(Object.values(PLAN_CODES));

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Parse + validar body.
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  if (typeof rawBody !== 'object' || rawBody === null) {
    return NextResponse.json({ error: 'Body deve ser um objecto' }, { status: 400 });
  }

  const body = rawBody as Record<string, unknown>;

  // planCode é validado à parte (vem do URL, não do form).
  if (typeof body['planCode'] !== 'string' || !PLAN_CODE_SET.has(body['planCode'])) {
    return NextResponse.json(
      { error: `planCode inválido. Esperado um de: ${[...PLAN_CODE_SET].join(', ')}` },
      { status: 400 },
    );
  }

  if (typeof body['tenantId'] !== 'string' || !UuidSchema.safeParse(body['tenantId']).success) {
    return NextResponse.json({ error: 'tenantId deve ser um UUID válido' }, { status: 400 });
  }

  const formParsed = CheckoutFormInputSchema.safeParse({
    email: body['email'],
    trialDays: body['trialDays'] ?? 0,
    couponCode: body['couponCode'] ?? '',
  });

  if (!formParsed.success) {
    const first = formParsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? 'Dados inválidos' },
      { status: 400 },
    );
  }

  const planCode = body['planCode'] as PlanCode;
  const tenantId = body['tenantId'] as string;

  // 2. Construir URLs de retorno. IMPORTANTE: {CHECKOUT_SESSION_ID} é
  // placeholder obrigatório da Stripe.
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3001';
  const successUrl = `${appUrl}/planos/${planCode}/sucesso?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appUrl}/planos/${planCode}/cancelado?session_id={CHECKOUT_SESSION_ID}`;

  // 3. Chamar Stripe via @beauty-saas/billing.
  try {
    const session = await createCheckoutSession({
      tenantId,
      customerEmail: formParsed.data.email,
      planCode,
      mode: 'subscription',
      trialDays: formParsed.data.trialDays > 0 ? formParsed.data.trialDays : undefined,
      couponCode: formParsed.data.couponCode,
      successUrl,
      cancelUrl,
      metadata: {
        source: 'platform-admin',
        // surface planCode slug para o webhook reconciliar.
        plan_code_slug: planCode,
      },
    });

    return NextResponse.json(
      {
        sessionId: session.sessionId,
        url: session.url,
        expiresAt: session.expiresAt.toISOString(),
      },
      { status: 200 },
    );
  } catch (err) {
    if (err instanceof PromotionCodeNotFoundError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.httpStatus },
      );
    }
    if (err instanceof SubscriptionConfigError) {
      return NextResponse.json(
        { error: err.message, envVar: err.envVar },
        { status: 500 },
      );
    }
    if (err instanceof StripeConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

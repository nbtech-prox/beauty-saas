/**
 * API Route: POST /api/billing/portal
 *
 * Cria uma Customer Portal Session para um tenant existente.
 *
 * Body (JSON):
 *   { tenantId }
 *
 * Returns 200: { url }
 * Returns 400: input inválido
 * Returns 404: tenant não tem customer Stripe
 * Returns 500: erro de config / Stripe
 *
 * IMPORTANTE: este endpoint é público por agora (sem auth). Em produção,
 * associar `tenantId` ao utilizador autenticado e validar ownership.
 */
import { NextResponse } from 'next/server';
import {
  findCustomerByTenantId,
  StripeConfigError,
  SubscriptionConfigError,
} from '@beauty-saas/billing';
import { UuidSchema } from '@beauty-saas/contracts';
import { createPortalSession } from '@beauty-saas/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
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
  if (typeof body['tenantId'] !== 'string') {
    return NextResponse.json({ error: 'tenantId é obrigatório' }, { status: 400 });
  }

  const tenantParsed = UuidSchema.safeParse(body['tenantId']);
  if (!tenantParsed.success) {
    return NextResponse.json({ error: 'tenantId inválido (UUID esperado)' }, { status: 400 });
  }

  try {
    const customer = await findCustomerByTenantId(tenantParsed.data);
    if (!customer) {
      return NextResponse.json(
        { error: 'Tenant não tem customer Stripe associado' },
        { status: 404 },
      );
    }

    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3001';
    const session = await createPortalSession({
      customerId: customer.id,
      returnUrl: `${appUrl}/planos`,
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err) {
    if (err instanceof StripeConfigError || err instanceof SubscriptionConfigError) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
/**
 * API Route: POST /api/auth/register
 *
 * Cria tenant + owner via `createTenantWithOwner` da
 * `@beauty-saas/database`, faz hash da password com PBKDF2, cria
 * sessão HTTP-only signed cookie.
 *
 * Body (JSON):
 *   { email, password, name }
 *
 * Returns:
 *   200 — { userId, tenantId }
 *   400 — body inválido
 *   429 — rate limit (5 tentativas por IP por minuto)
 *   500 — erro interno (DB / config)
 *
 * Variáveis de ambiente necessárias:
 *   ONBOARDING_SESSION_SECRET  — >= 32 bytes
 *   DATABASE_URL               — runtime tenant-scoped
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createTenantWithOwner } from '@beauty-saas/database';
import { hashPassword } from '@/lib/auth/password';
import {
  createSession,
  SESSION_COOKIE_NAME,
  serializeSessionCookie,
} from '@/lib/auth/session';
import { sharedRateLimiter } from '@/lib/auth/rate-limit';
import { getPool } from '@/lib/db/postgres';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RegisterInputSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(12).max(256),
  name: z.string().min(1).max(100),
});

const rateLimiter = sharedRateLimiter;

function getClientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Rate limit por IP.
  const ip = getClientIp(request);
  const rl = rateLimiter.hit(ip);
  if (!rl.allowed) {
    return NextResponse.json(
      {
        error: 'Demasiadas tentativas. Tenta novamente em 1 minuto.',
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)),
        },
      },
    );
  }

  // 2. Parse + validar body.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }

  const parsed = RegisterInputSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? 'Dados inválidos' },
      { status: 400 },
    );
  }

  // 3. Hash da password (PBKDF2).
  const passwordHash = await hashPassword(parsed.data.password);

  // 4. Slug provisório baseado no email (será substituído no passo 2 do
  // wizard). Único por construção (email é unique).
  const slug =
    `t-${parsed.data.email
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 30)}` || 't-pending';

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  // 5. Criar tenant + owner.
  try {
    const pool = getPool();
    const { tenant, owner } = await createTenantWithOwner(pool, {
      slug,
      name: `${parsed.data.name} (provisional)`,
      ownerEmail: parsed.data.email,
      ownerName: parsed.data.name,
      passwordHash,
      trialEndsAt,
    });

    // 6. Criar sessão.
    const session = await createSession({
      sub: owner.id,
      tenantId: tenant.id,
    });

    const cookie = serializeSessionCookie({
      name: SESSION_COOKIE_NAME,
      value: session.cookieValue,
      maxAgeSeconds: 7 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
    });

    return NextResponse.json(
      {
        userId: owner.id,
        tenantId: tenant.id,
      },
      {
        status: 200,
        headers: {
          'set-cookie': cookie,
        },
      },
    );
  } catch (err) {
    console.error('[register] erro interno', {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Erro interno a criar a conta' },
      { status: 500 },
    );
  }
}

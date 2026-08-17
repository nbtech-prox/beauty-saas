/**
 * API Route: PATCH /api/auth/salon
 *
 * Passo 2 do wizard de onboarding — actualiza o slug, nome, timezone
 * e currency do tenant criado no passo 1.
 *
 * Body (JSON):
 *   { slug, name, timezone, currency }
 *
 * Returns:
 *   200 — { tenantId, slug, name, timezone, currency }
 *   400 — body inválido (slug com formato errado, etc.)
 *   401 — sem sessão válida
 *   409 — slug já tomado por outro tenant
 *   500 — erro interno (DB)
 *
 * Estratégia:
 *  - Valida sessão via `readSession` (Node crypto) usando o cookie
 *    `onboarding_session`.
 *  - Detecta colisão com `SELECT 1 FROM tenants WHERE slug=$1 AND id != $2`.
 *  - Actualiza via `UPDATE tenants SET ... WHERE id = $tenantId`.
 *  - Mantém a query SQL inline no MVP — fácil de migrar para
 *    `tenancy-core`/`database` mais tarde.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSession, SESSION_COOKIE_NAME } from '@/lib/auth/session';
import { getPool } from '@/lib/db/postgres';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SalonInputSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      message:
        'slug deve ter apenas letras minúsculas, dígitos e hífens (3..30 chars)',
    }),
  name: z.string().min(1).max(100),
  timezone: z.string().min(1).max(64),
  currency: z.literal('EUR'),
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

export async function PATCH(request: Request): Promise<NextResponse> {
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
  const parsed = SalonInputSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message ?? 'Dados do salão inválidos',
      },
      { status: 400 },
    );
  }

  const { slug, name, timezone, currency } = parsed.data;
  const tenantId = session.tenantId;

  // 3. Detectar colisão de slug.
  try {
    const pool = getPool();
    const collision = await pool.query<{ exists: number }>(
      'SELECT 1 AS exists FROM tenants WHERE slug = $1 AND id <> $2 LIMIT 1',
      [slug, tenantId],
    );
    if ((collision.rowCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Esse slug já está a ser usado por outro salão.' },
        { status: 409 },
      );
    }

    // 4. Actualizar tenant.
    const updated = await pool.query<{
      id: string;
      slug: string;
      name: string;
      timezone: string;
      currency: 'EUR';
    }>(
      `UPDATE tenants
         SET slug = $1, name = $2, timezone = $3, currency = $4,
             updated_at = NOW()
       WHERE id = $5
       RETURNING id, slug, name, timezone, currency`,
      [slug, name, timezone, currency, tenantId],
    );
    const row = updated.rows[0];
    if (!row) {
      return NextResponse.json(
        { error: 'Tenant não encontrado' },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        tenantId: row.id,
        slug: row.slug,
        name: row.name,
        timezone: row.timezone,
        currency: row.currency,
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[salon] erro interno', {
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Erro interno a actualizar o salão' },
      { status: 500 },
    );
  }
}

/**
 * Testes do endpoint POST /api/auth/register.
 *
 * Cobre:
 *  - 200 OK com input válido → user+tenant criados + cookie de sessão
 *  - 400 Bad Request em input inválido (email/password/name)
 *  - 429 Too Many Requests após 5 tentativas por IP (rate limit)
 *  - invariante: passwordHash nunca é devolvido no payload
 *  - 500 em erro interno (DB fora do ar)
 *
 * Estratégia:
 *  - mock `@beauty-saas/database::createTenantWithOwner`
 *  - mock do `pg` Pool via `getPool` mockado
 *  - rate limit é real (in-memory, isolado por teste)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocks hoisted — têm de ser declarados antes do import do route.
const { createTenantWithOwnerMock } = vi.hoisted(() => ({
  createTenantWithOwnerMock: vi.fn(),
}));

vi.mock('@beauty-saas/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@beauty-saas/database')>();
  return {
    ...actual,
    createTenantWithOwner: createTenantWithOwnerMock,
  };
});

const { getPoolMock } = vi.hoisted(() => ({
  getPoolMock: vi.fn(),
}));

vi.mock('@/lib/db/postgres', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/postgres')>();
  return {
    ...actual,
    getPool: getPoolMock,
  };
});

const { POST } = await import('./route');
const { __resetSharedRateLimiterForTests } =
  await import('@/lib/auth/rate-limit');

const TEST_SECRET = 'unit-test-secret-32bytes-or-more-OK-1234567890abcdef';

function validBody(
  overrides: Partial<{ email: string; password: string; name: string }> = {},
) {
  return JSON.stringify({
    email: 'owner@salon.pt',
    password: 'CorrectHorseBattery!',
    name: 'Maria Silva',
    ...overrides,
  });
}

function postRequest(body: string | undefined, ip = '127.0.0.1'): Request {
  const headers = new Headers({
    'content-type': 'application/json',
    'x-forwarded-for': ip,
  });
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers,
    body,
  });
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    process.env['ONBOARDING_SESSION_SECRET'] = TEST_SECRET;
    process.env['DATABASE_URL'] = 'postgres://test:test@localhost/test';
    __resetSharedRateLimiterForTests();
    createTenantWithOwnerMock.mockReset();
    getPoolMock.mockReset();
    // Pool dummy — não é chamado se createTenantWithOwner for mockado, mas
    // serve para satisfazer o getPool().
    getPoolMock.mockReturnValue({} as never);
    createTenantWithOwnerMock.mockResolvedValue({
      tenant: {
        id: '00000000-0000-4000-8000-000000000099',
        slug: 'salon-temp',
        name: 'Salão Temp',
        status: 'trialing',
        timezone: 'Europe/Lisbon',
        currency: 'EUR',
        locale: 'pt-PT',
        trialEndsAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      owner: {
        id: '00000000-0000-4000-8000-0000000000aa',
        tenantId: '00000000-0000-4000-8000-000000000099',
        email: 'owner@salon.pt',
        name: 'Maria Silva',
        role: 'admin',
        permissions: 20,
        isOwner: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devolve 200 com input válido e cria tenant+owner', async () => {
    const response = await POST(postRequest(validBody()));

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json['userId']).toBe('00000000-0000-4000-8000-0000000000aa');
    expect(json['tenantId']).toBe('00000000-0000-4000-8000-000000000099');
    // Set-Cookie presente
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/Path=\//);
    // Invariante: passwordHash NUNCA exposto
    expect(JSON.stringify(json)).not.toMatch(/passwordHash/i);
    expect(JSON.stringify(json)).not.toMatch(/pbkdf2\$/);
  });

  it('devolve 400 quando o email é inválido', async () => {
    const response = await POST(
      postRequest(validBody({ email: 'not-an-email' })),
    );
    expect(response.status).toBe(400);
    expect(createTenantWithOwnerMock).not.toHaveBeenCalled();
  });

  it('devolve 400 quando a password tem menos de 12 chars', async () => {
    const response = await POST(
      postRequest(validBody({ password: 'short1!Aa' })),
    );
    expect(response.status).toBe(400);
    expect(createTenantWithOwnerMock).not.toHaveBeenCalled();
  });

  it('devolve 400 quando o body não é JSON', async () => {
    const response = await POST(postRequest('not json'));
    expect(response.status).toBe(400);
  });

  it('devolve 400 quando o body está vazio', async () => {
    const response = await POST(postRequest(undefined));
    expect(response.status).toBe(400);
  });

  it('devolve 400 quando o name está vazio', async () => {
    const response = await POST(postRequest(validBody({ name: '' })));
    expect(response.status).toBe(400);
  });

  it('devolve 429 após 5 tentativas do mesmo IP', async () => {
    const ip = '10.0.0.1';
    for (let i = 0; i < 5; i++) {
      const response = await POST(
        postRequest(validBody({ email: `u${i}@x.pt` }), ip),
      );
      expect(response.status).toBe(200);
    }
    const blocked = await POST(
      postRequest(validBody({ email: 'u6@x.pt' }), ip),
    );
    expect(blocked.status).toBe(429);
  });

  it('rate limit é independente por IP', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await POST(
        postRequest(validBody({ email: `a${i}@x.pt` }), '10.0.0.2'),
      );
      expect(response.status).toBe(200);
    }
    // IP diferente → não bloqueado
    const otherIp = await POST(
      postRequest(validBody({ email: 'b@x.pt' }), '10.0.0.3'),
    );
    expect(otherIp.status).toBe(200);
  });

  it('devolve 500 quando createTenantWithOwner lança', async () => {
    createTenantWithOwnerMock.mockRejectedValueOnce(
      new Error('DB indisponível'),
    );
    const response = await POST(postRequest(validBody()));
    expect(response.status).toBe(500);
  });

  it('passa a password hashed para createTenantWithOwner', async () => {
    await POST(postRequest(validBody()));
    expect(createTenantWithOwnerMock).toHaveBeenCalledTimes(1);
    const args = createTenantWithOwnerMock.mock.calls[0]!;
    const input = args[1] as { passwordHash: string };
    expect(input.passwordHash).toMatch(/^pbkdf2\$/);
    expect(input.passwordHash).not.toContain('CorrectHorseBattery!');
  });
});

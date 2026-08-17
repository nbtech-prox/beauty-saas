/**
 * Testes do endpoint PATCH /api/auth/salon.
 *
 * Cobre:
 *  - 401 sem cookie de sessão
 *  - 400 quando o slug tem formato inválido
 *  - 409 quando o slug colide com outro tenant
 *  - 200 com input válido → actualiza tenant + devolve {tenantId, slug}
 *  - 500 em erro interno
 *
 * Estratégia:
 *  - mock `getPool` para devolver um objecto com `query` que programamos
 *  - cookie gerado por `createSession` (Node) é usado como cookie válido
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const { PATCH } = await import('./route');
const { createSession } = await import('@/lib/auth/session');

const TEST_SECRET = 'unit-test-secret-32bytes-or-more-OK-1234567890abcdef';

function validBody(
  overrides: Partial<{ slug: string; name: string; timezone: string }> = {},
) {
  return JSON.stringify({
    slug: 'salon-maria',
    name: 'Salão Maria',
    timezone: 'Europe/Lisbon',
    currency: 'EUR',
    ...overrides,
  });
}

function patchRequest(body: string | undefined, cookieValue?: string): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (cookieValue) headers.set('cookie', `onboarding_session=${cookieValue}`);
  return new Request('http://localhost/api/auth/salon', {
    method: 'PATCH',
    headers,
    body,
  });
}

describe('PATCH /api/auth/salon', () => {
  let queryMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    process.env['ONBOARDING_SESSION_SECRET'] = TEST_SECRET;
    process.env['DATABASE_URL'] = 'postgres://test:***@localhost/test';
    queryMock = vi.fn();
    getPoolMock.mockReset();
    getPoolMock.mockReturnValue({ query: queryMock });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('devolve 401 sem cookie de sessão', async () => {
    const response = await PATCH(patchRequest(validBody()));
    expect(response.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('devolve 401 com cookie mal formado', async () => {
    const response = await PATCH(patchRequest(validBody(), 'not.a.cookie'));
    expect(response.status).toBe(401);
  });

  it('devolve 400 com body JSON inválido', async () => {
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    const response = await PATCH(patchRequest('not-json', cookieValue));
    expect(response.status).toBe(400);
  });

  it('devolve 400 com slug com formato inválido (curto)', async () => {
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    const response = await PATCH(
      patchRequest(validBody({ slug: 'ab' }), cookieValue),
    );
    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('devolve 400 com slug com caracteres inválidos', async () => {
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    const response = await PATCH(
      patchRequest(validBody({ slug: 'Salon Com Espaços!' }), cookieValue),
    );
    expect(response.status).toBe(400);
  });

  it('devolve 409 quando o slug já está tomado', async () => {
    // 1ª query: SELECT 1 ... → devolve linha (slug tomado)
    queryMock.mockResolvedValueOnce({ rows: [{ exists: 1 }], rowCount: 1 });
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    const response = await PATCH(patchRequest(validBody(), cookieValue));
    expect(response.status).toBe(409);
    // Não chama o UPDATE
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('devolve 200 e actualiza o tenant com input válido', async () => {
    // 1ª query: SELECT 1 ... → vazio (slug livre)
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    // 2ª query: UPDATE ... → devolve row actualizada
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          id: '00000000-0000-4000-8000-000000000099',
          slug: 'salon-maria',
          name: 'Salão Maria',
          timezone: 'Europe/Lisbon',
          currency: 'EUR',
          locale: 'pt-PT',
          trial_ends_at: null,
          status: 'trialing',
          created_at: new Date('2026-01-01'),
          updated_at: new Date('2026-01-02'),
        },
      ],
      rowCount: 1,
    });
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    const response = await PATCH(patchRequest(validBody(), cookieValue));
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      tenantId: string;
      slug: string;
      name: string;
      timezone: string;
      currency: string;
    };
    expect(json.tenantId).toBe('00000000-0000-4000-8000-000000000099');
    expect(json.slug).toBe('salon-maria');
    expect(json.name).toBe('Salão Maria');
    expect(json.timezone).toBe('Europe/Lisbon');
    expect(json.currency).toBe('EUR');
    expect(queryMock).toHaveBeenCalledTimes(2);
  });

  it('devolve 500 quando o SELECT de colisão lança', async () => {
    queryMock.mockRejectedValueOnce(new Error('DB indisponível'));
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    const response = await PATCH(patchRequest(validBody(), cookieValue));
    expect(response.status).toBe(500);
  });

  it('devolve 500 quando o UPDATE lança', async () => {
    queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    queryMock.mockRejectedValueOnce(new Error('DB indisponível no update'));
    const { cookieValue } = await createSession({
      sub: '00000000-0000-4000-8000-0000000000aa',
      tenantId: '00000000-0000-4000-8000-000000000099',
    });
    const response = await PATCH(patchRequest(validBody(), cookieValue));
    expect(response.status).toBe(500);
  });
});

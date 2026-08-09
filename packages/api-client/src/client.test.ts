import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HttpClient } from './client.js';
import { ApiError, InvalidJsonError, NetworkError, ValidationError } from './errors.js';

/* ──────────────────────── helpers ──────────────────────── */

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function emptyResponse(status: number): Response {
  return new Response(null, { status });
}

function makeClient(overrides: Partial<ConstructorParameters<typeof HttpClient>[0]> = {}): HttpClient {
  return new HttpClient({
    baseUrl: 'https://api.example.com',
    tenantSlug: 'demo',
    retryBackoffMs: 1, // acelerar testes
    timeoutMs: 200,
    ...overrides,
  });
}

beforeEach(() => {
  // sem fake timers — eles interferem com o retry loop e com AbortSignal.
  // Os backoffs são curtos (retryBackoffMs: 1) para manter os testes rápidos.
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/* ──────────────────────── testes ──────────────────────── */

describe('HttpClient — request básico', () => {
  it('GET com JSON 200 devolve o body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    const res = await client.get<{ ok: boolean }>('/v1/ping');

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/v1/ping');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).credentials).toBe('include');
  });

  it('injecta X-Tenant-Slug em todos os pedidos por defeito', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.get('/v1/services');

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-Tenant-Slug']).toBe('demo');
  });

  it('não injecta X-Tenant-Slug com noTenantHeader: true', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.get('/v1/auth/me', { noTenantHeader: true });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-Tenant-Slug']).toBeUndefined();
  });

  it('injecta Content-Type quando há body', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.post('/v1/appointments', { foo: 'bar' }, { noCsrf: true });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect((init as RequestInit).body).toBe(JSON.stringify({ foo: 'bar' }));
  });

  it('serializa query params omitindo null/undefined', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.get('/v1/services', {
      query: { active: true, page: 1, q: undefined, tag: null },
    });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/v1/services?active=true&page=1');
  });

  it('faz trim à barra final do baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ baseUrl: 'https://api.example.com///' });
    await client.get('/v1/x');

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.com/v1/x');
  });

  it('junta defaultHeaders do config e do request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ defaultHeaders: { 'X-Trace': 'abc' } });
    await client.get('/v1/x', { headers: { 'X-Request': '123' } });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['X-Trace']).toBe('abc');
    expect(headers['X-Request']).toBe('123');
  });
});

describe('HttpClient — respostas de erro', () => {
  it('4xx lança ApiError com body parseado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(422, { message: 'Validation failed', errors: { email: ['x'] } }),
      ),
    );

    const client = makeClient();
    try {
      await client.get('/v1/x');
      expect.fail('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(422);
      expect(err.body).toEqual({ message: 'Validation failed', errors: { email: ['x'] } });
    }
  });

  it('5xx com body não-JSON envolve como { message: text }', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('Bad gateway raw', { status: 502 })),
    );

    const client = makeClient({ maxRetries: 0 });
    try {
      await client.get('/v1/x');
      expect.fail('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).body).toEqual({ message: 'Bad gateway raw' });
    }
  });

  it('5xx é retentado até maxRetries e depois lança ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(503));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ maxRetries: 2, retryBackoffMs: 1 });
    await expect(client.get('/v1/x')).rejects.toBeInstanceOf(ApiError);

    // 1 inicial + 2 retries = 3 chamadas
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('200 com body que falha o schema lança ValidationError com issues detalhados', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse(200, { wrong: 'shape' })),
    );

    const client = makeClient();
    const schema = z.object({ name: z.string() });

    try {
      await client.get('/v1/x', { responseSchema: schema });
      expect.fail('expected to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      const ve = e as ValidationError;
      expect(ve.schema).toBe('response'); // sem description no schema
      expect(ve.issues.length).toBeGreaterThan(0);
      expect(ve.issues[0]?.path).toBeTruthy();
    }
  });

  it('200 com body vazio devolve null (sem schema)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(emptyResponse(204)));

    const client = makeClient();
    const res = await client.get('/v1/x');
    expect(res).toBeNull();
  });

  it('200 OK com body não-JSON lança InvalidJsonError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('not json at all', { status: 200 })),
    );

    const client = makeClient();
    await expect(client.get('/v1/x')).rejects.toBeInstanceOf(InvalidJsonError);
  });
});

describe('HttpClient — retry e backoff', () => {
  it('retry em 5xx: 1ª falha, 2ª sucede', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(emptyResponse(500))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ maxRetries: 2, retryBackoffMs: 1 });
    const res = await client.get('/v1/x');

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('4xx NÃO é retentado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, { message: 'not found' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ maxRetries: 3, retryBackoffMs: 1 });
    await expect(client.get('/v1/x')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maxRetries: 0 faz uma única tentativa', async () => {
    const fetchMock = vi.fn().mockResolvedValue(emptyResponse(500));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ maxRetries: 0 });
    await expect(client.get('/v1/x')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('backoff cresce exponencialmente', async () => {
    const delays: number[] = [];
    const start = Date.now();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => {
        delays.push(Date.now() - start);
        return emptyResponse(500);
      })
      .mockImplementationOnce(async () => {
        delays.push(Date.now() - start);
        return emptyResponse(500);
      })
      .mockImplementationOnce(async () => {
        delays.push(Date.now() - start);
        return jsonResponse(200, {});
      });
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ maxRetries: 2, retryBackoffMs: 50 });
    const before = Date.now();
    await client.get('/v1/x');
    const after = Date.now();

    // 1ª chamada: t≈0
    // 2ª chamada: após 50ms (50 * 2^0)
    // 3ª chamada: após 50+100 = 150ms (50 * 2^1)
    expect(delays).toHaveLength(3);
    expect(delays[1]!).toBeGreaterThanOrEqual(40); // tolerância de timing
    expect(delays[2]!).toBeGreaterThanOrEqual(140);
    expect(after - before).toBeGreaterThanOrEqual(140);
  });
});

describe('HttpClient — AbortSignal e timeout', () => {
  it('timeoutMs dispara NetworkError (AbortError)', async () => {
    // Simular fetch que nunca resolve (vai ser abortado por timeout)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: unknown, init: RequestInit | undefined) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            if (signal) {
              signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
              });
            }
          }),
      ),
    );

    const client = makeClient({ timeoutMs: 50, maxRetries: 0 });
    await expect(client.get('/v1/x')).rejects.toBeInstanceOf(NetworkError);
  });

  it('sinal externo aborted aborta o pedido', async () => {
    // fetch mockado que rejeita imediatamente se o signal já estiver aborted
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: unknown, init: RequestInit | undefined) => {
        return new Promise((_resolve, reject) => {
          const signal = init?.signal as AbortSignal | undefined;
          if (signal?.aborted) {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
            return;
          }
          if (signal) {
            signal.addEventListener('abort', () => {
              const err = new Error('aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      }),
    );

    const controller = new AbortController();
    controller.abort();

    const client = makeClient({ maxRetries: 0 });
    await expect(client.get('/v1/x', { signal: controller.signal })).rejects.toBeInstanceOf(NetworkError);
  });

  it('sinal externo é encadeado: aborta após chamada, fetch rejeita', async () => {
    let externalSignal: AbortSignal | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: unknown, init: RequestInit | undefined) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            if (signal) {
              signal.addEventListener('abort', () => {
                const err = new Error('aborted');
                err.name = 'AbortError';
                reject(err);
              });
            }
            externalSignal = signal ?? null;
          }),
      ),
    );

    const controller = new AbortController();
    const client = makeClient({ maxRetries: 0 });
    const promise = client.get('/v1/x', { signal: controller.signal });

    // dar tempo do request arrancar
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(promise).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('HttpClient — CSRF', () => {
  it('POST com withCsrf faz GET a /v1/auth/csrf-cookie antes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(emptyResponse(204)) // csrf-cookie
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // POST
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.post('/v1/appointments', { x: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // 1ª chamada: csrf-cookie, sem X-Tenant-Slug, sem CSRF
    const [url1, init1] = fetchMock.mock.calls[0]!;
    expect(url1).toBe('https://api.example.com/v1/auth/csrf-cookie');
    const headers1 = (init1 as RequestInit).headers as Record<string, string>;
    expect(headers1['X-Tenant-Slug']).toBeUndefined();

    // 2ª chamada: POST, COM X-Tenant-Slug
    const [url2, init2] = fetchMock.mock.calls[1]!;
    expect(url2).toBe('https://api.example.com/v1/appointments');
    const headers2 = (init2 as RequestInit).headers as Record<string, string>;
    expect(headers2['X-Tenant-Slug']).toBe('demo');
  });

  it('GET não chama csrf-cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.get('/v1/services');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('DELETE não chama csrf-cookie', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(emptyResponse(204));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.delete('/v1/x/1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('withCsrf: false desactiva o CSRF', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ withCsrf: false });
    await client.post('/v1/x', { a: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('noCsrf: true no request desactiva CSRF só para esse request', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.post('/v1/x', { a: 1 }, { noCsrf: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('CSRF é cacheado: 2º POST não volta a chamar csrf-cookie', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(emptyResponse(204)) // csrf
      .mockResolvedValueOnce(jsonResponse(200, {})) // POST 1
      .mockResolvedValueOnce(jsonResponse(200, {})); // POST 2 (reusa csrf)
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.post('/v1/x', { a: 1 });
    await client.post('/v1/y', { b: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('resetCsrf limpa a cache e o próximo POST volta a buscar', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(emptyResponse(204)) // csrf 1
      .mockResolvedValueOnce(jsonResponse(200, {})) // POST 1
      .mockResolvedValueOnce(emptyResponse(204)) // csrf 2
      .mockResolvedValueOnce(jsonResponse(200, {})); // POST 2
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    await client.post('/v1/x', {});
    client.resetCsrf();
    await client.post('/v1/y', {});

    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('csrf-cookie falhar é best-effort: POST continua', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(419, { message: 'expired' })) // csrf falha
      .mockResolvedValueOnce(jsonResponse(200, { ok: true })); // POST passa
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient();
    const res = await client.post('/v1/x', {});

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('HttpClient — erros de rede', () => {
  it('fetch rejected (sem AbortError) lança NetworkError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')));

    const client = makeClient({ maxRetries: 0 });
    await expect(client.get('/v1/x')).rejects.toBeInstanceOf(NetworkError);
  });

  it('fetch rejected é retentado', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = makeClient({ maxRetries: 2, retryBackoffMs: 1 });
    const res = await client.get('/v1/x');

    expect(res).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('HttpClient — responseSchema', () => {
  it('passa o body pelo schema e devolve parsed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(200, { name: 'Ana', age: 30 })));

    const client = makeClient();
    const schema = z.object({ name: z.string(), age: z.number() });
    const res = await client.get('/v1/x', { responseSchema: schema });

    expect(res).toEqual({ name: 'Ana', age: 30 });
  });

  it('usa a description do schema na ValidationError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(200, {})));

    const client = makeClient();
    const schema = z.object({ name: z.string() }).describe('Service');
    try {
      await client.get('/v1/x', { responseSchema: schema });
    } catch (e) {
      expect((e as ValidationError).schema).toBe('Service');
    }
  });
});

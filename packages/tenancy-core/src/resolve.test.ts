import { describe, expect, it, vi } from 'vitest';
import { TenantResolutionCache } from './cache.js';
import type { TenantResolution } from './resolve.js';
import { resolveTenantBySlug } from './resolve.js';

/**
 * Helper para criar um `fetch` mockado. Aceita um mapa
 * `slug → body de resposta` (status 200 + payload).
 */
function makeFakeFetchOK(
  bodyBySlug: Record<
    string,
    { tenantId: string; status: string; name: string; planCode: string }
  >,
): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    const m = url.match(/\/tenancy\/resolve\/([^/?#]+)/);
    const slug = m ? decodeURIComponent(m[1] ?? '') : '';
    const body = bodyBySlug[slug];
    if (!body) {
      return new Response('not found', { status: 404 });
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

describe('resolveTenantBySlug', () => {
  it('returns not_found for slug with invalid format (too short)', async () => {
    const fetchImpl = makeFakeFetchOK({});
    const cache = new TenantResolutionCache();
    const result = await resolveTenantBySlug('ab', { fetchImpl, cache });

    expect(result.status).toBe<TenantResolution['status']>('not_found');
    expect(result.slug).toBe('ab');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns not_found for slug containing invalid characters (raw)', async () => {
    // Espaços e underscore não passam na regex; não-normalizamos para isto.
    const fetchImpl = makeFakeFetchOK({});
    const cache = new TenantResolutionCache();
    const result = await resolveTenantBySlug('salao aurora!', {
      fetchImpl,
      cache,
    });

    expect(result.status).toBe('not_found');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('resolves active tenant on 200 with full body', async () => {
    const fetchImpl = makeFakeFetchOK({
      salao: {
        tenantId: '11111111-1111-4111-8111-111111111111',
        status: 'active',
        name: 'Salão Aurora',
        planCode: 'pro-monthly',
      },
    });
    const cache = new TenantResolutionCache();
    const result = await resolveTenantBySlug('salao', { fetchImpl, cache });

    expect(result.status).toBe('active');
    expect(result.tenantId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.slug).toBe('salao');
    expect(result.name).toBe('Salão Aurora');
    expect(result.planCode).toBe('pro-monthly');
  });

  it('returns not_found when remote returns 404', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('nope', { status: 404 }),
    ) as unknown as typeof fetch;
    const cache = new TenantResolutionCache();
    const result = await resolveTenantBySlug('inexistente', {
      fetchImpl,
      cache,
    });

    expect(result.status).toBe('not_found');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('returns not_found when fetch rejects (timeout/abort) and does not throw', async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, init?: RequestInit) => {
        // Rejeita quando o signal abortar — simula timeout real.
        return await new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal) {
            if (signal.aborted) {
              reject(new DOMException('aborted', 'AbortError'));
              return;
            }
            signal.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }
        });
      },
    ) as unknown as typeof fetch;

    const cache = new TenantResolutionCache();
    const result = await resolveTenantBySlug('salao', {
      fetchImpl,
      cache,
      resolveUrl: 'http://localhost:9999/tenancy/resolve',
      timeoutMs: 50, // curto para não prolongar suite
    });

    expect(result.status).toBe('not_found');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('caches successful resolution — second call within TTL does not re-fetch', async () => {
    const fetchImpl = makeFakeFetchOK({
      salao: {
        tenantId: '22222222-2222-4222-8222-222222222222',
        status: 'active',
        name: 'Salão Aurora',
        planCode: 'starter-monthly',
      },
    });
    const cache = new TenantResolutionCache();
    const first = await resolveTenantBySlug('salao', { fetchImpl, cache });
    const second = await resolveTenantBySlug('salao', { fetchImpl, cache });

    expect(first.tenantId).toBe('22222222-2222-4222-8222-222222222222');
    expect(second.tenantId).toBe('22222222-2222-4222-8222-222222222222');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('normalises accent and case in slug before calling fetch', async () => {
    const fetchImpl = makeFakeFetchOK({
      'salao-aurora': {
        tenantId: '33333333-3333-4333-8333-333333333333',
        status: 'trialing',
        name: 'Salão Aurora',
        planCode: 'pro-yearly',
      },
    });
    const cache = new TenantResolutionCache();

    const result = await resolveTenantBySlug('Salão-Aurora', {
      fetchImpl,
      cache,
    });

    expect(result.status).toBe('trialing');
    expect(result.slug).toBe('salao-aurora');
    // O URL recebido pelo fetch deve usar o slug normalizado.
    const called = (fetchImpl as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0]?.[0];
    expect(String(called)).toContain('salao-aurora');
    expect(String(called)).not.toMatch(/%C3|Sal/);
  });
});

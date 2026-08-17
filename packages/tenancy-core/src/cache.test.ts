import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantResolutionCache } from './cache.js';
import type { TenantResolution } from './resolve.js';

const sample: TenantResolution = {
  status: 'active',
  tenantId: '11111111-1111-4111-8111-111111111111',
  slug: 'salao',
  name: 'Salão Aurora',
  planCode: 'pro-monthly',
};

describe('TenantResolutionCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves a value within TTL', () => {
    const cache = new TenantResolutionCache();
    cache.set('salao', sample);

    expect(cache.get('salao')).toEqual(sample);
  });

  it('returns undefined after TTL expires', () => {
    const cache = new TenantResolutionCache();
    cache.set('salao', sample, 1000);

    vi.advanceTimersByTime(1001);

    expect(cache.get('salao')).toBeUndefined();
  });

  it('keeps value within TTL window', () => {
    const cache = new TenantResolutionCache();
    cache.set('salao', sample, 5000);

    vi.advanceTimersByTime(4999);

    expect(cache.get('salao')).toEqual(sample);
  });

  it('overwrites existing key on second set', () => {
    const cache = new TenantResolutionCache();
    cache.set('salao', sample);
    const updated: TenantResolution = { ...sample, name: 'Outro' };
    cache.set('salao', updated);

    expect(cache.get('salao')).toEqual(updated);
  });

  it('does not cache not_found values without explicit TTL', () => {
    const cache = new TenantResolutionCache();
    cache.set('inexistente', { status: 'not_found' });

    expect(cache.get('inexistente')).toBeUndefined();
  });

  it('delete() removes the entry', () => {
    const cache = new TenantResolutionCache();
    cache.set('salao', sample);
    cache.delete('salao');

    expect(cache.get('salao')).toBeUndefined();
  });

  it('clear() empties the store', () => {
    const cache = new TenantResolutionCache();
    cache.set('a', sample);
    cache.set('b', sample);

    cache.clear();

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
  });

  it('get() returns undefined for unknown key', () => {
    const cache = new TenantResolutionCache();
    expect(cache.get('nao-existe')).toBeUndefined();
  });
});

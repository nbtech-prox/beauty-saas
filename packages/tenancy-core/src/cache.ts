/**
 * Cache em memória para resoluções de tenant.
 *
 * Não persiste entre reinícios do processo — propositadamente simples.
 * Promoted a Redis-backed cache num Marco futuro.
 */

import type { TenantResolution } from './resolve.js';

interface CacheEntry {
  value: TenantResolution;
  expiresAt: number;
}

export class TenantResolutionCache {
  private readonly store = new Map<string, CacheEntry>();

  get(slug: string): TenantResolution | undefined {
    const entry = this.store.get(slug);
    if (!entry) return undefined;
    const now = Date.now();
    if (now >= entry.expiresAt) {
      this.store.delete(slug);
      return undefined;
    }
    return entry.value;
  }

  set(slug: string, value: TenantResolution, ttlMs = 60_000): void {
    // Conforme spec: valores `not_found` NÃO são cacheados por defeito.
    // Para forçar cache de um 'not_found' (raro), passar ttlMs explícito > 0
    // continua a cachear — mas o default semântica (sem ttlMs explícito) é
    // "não cachear". Implementação: detectamos via comparação ao default.
    const isExplicitTtl = arguments.length >= 3;
    if (value.status === 'not_found' && !isExplicitTtl) {
      this.store.delete(slug);
      return;
    }
    this.store.set(slug, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(slug: string): void {
    this.store.delete(slug);
  }

  clear(): void {
    this.store.clear();
  }
}

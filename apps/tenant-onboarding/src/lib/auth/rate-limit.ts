/**
 * Rate limiter in-memory: token bucket por chave (ex.: IP).
 *
 * Janela: 1 minuto (renova completamente).
 * Capacidade: 5 tokens por chave.
 *
 * Adequado para testes e dev. Em produção multi-instância, este
 * helper deveria ser substituído por Redis ou similar — está isolado
 * para que isso seja fácil de trocar.
 */

export interface RateLimitConfig {
  readonly capacity: number;
  readonly windowMs: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  /** Tokens restantes após esta tentativa. */
  readonly remaining: number;
  /** ms até a janela ser totalmente reposta. 0 se allowed. */
  readonly retryAfterMs: number;
}

export interface RateLimiter {
  hit(key: string): RateLimitResult;
  reset(key?: string): void;
}

interface BucketState {
  tokens: number;
  resetAt: number;
}

export function createRateLimiter(
  config: RateLimitConfig = { capacity: 5, windowMs: 60_000 },
): RateLimiter {
  const buckets = new Map<string, BucketState>();

  function hit(key: string): RateLimitResult {
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { tokens: config.capacity, resetAt: now + config.windowMs };
      buckets.set(key, bucket);
    }

    if (bucket.tokens <= 0) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterMs: Math.max(0, bucket.resetAt - now),
      };
    }

    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: bucket.tokens,
      retryAfterMs: 0,
    };
  }

  function reset(key?: string): void {
    if (key === undefined) buckets.clear();
    else buckets.delete(key);
  }

  return { hit, reset };
}

// Singleton partilhado pela route — exposto para reset em testes.
const sharedLimiter = createRateLimiter();

/** Rate limiter partilhado — usado pela route /api/auth/register. */
export const sharedRateLimiter: RateLimiter = sharedLimiter;

/** Apenas para testes — repõe o singleton partilhado. */
export function __resetSharedRateLimiterForTests(): void {
  sharedLimiter.reset();
}

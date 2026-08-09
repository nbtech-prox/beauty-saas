/**
 * Cliente Stripe singleton + helpers de configuração.
 *
 * Não guardamos secrets em código — lidos de env. O `getStripeClient()` é
 * lazy para evitar criar cliente em ambiente de teste que não precisa.
 *
 * Variáveis de ambiente (definidas pelo `platform-admin` no arranque):
 *   - STRIPE_SECRET_KEY          (sk_test_... ou sk_live_...)
 *   - STRIPE_WEBHOOK_SECRET      (whsec_...)
 *   - STRIPE_API_VERSION         (opcional, default: versão do SDK pinada)
 */
import Stripe from 'stripe';

/** Versão pinada do Stripe API — evita surpresas quando o SDK actualiza. */
export const PINNED_STRIPE_API_VERSION = '2025-09-30.clover' as const;

/**
 * Opções do `getStripeClient`.
 *
 * `apiVersion` por defeito é a versão pinada deste package. Para usar a
 * versão do SDK instalado (`stripe.DEFAULT_API_VERSION`), passa
 * `apiVersion: 'sdk-default'`.
 */
export interface StripeClientOptions {
  readonly apiVersion?: 'sdk-default' | typeof PINNED_STRIPE_API_VERSION;
  /** Override do secret (apenas para testes). */
  readonly secretKey?: string;
  /** App info customizado (aparece no User-Agent do Stripe). */
  readonly appInfo?: Stripe.AppInfo;
}

let cached: Stripe | null = null;
let cachedOptionsKey: string | null = null;

function resolveSecretKey(override?: string): string {
  const fromEnv = process.env['STRIPE_SECRET_KEY'];
  const key = override ?? fromEnv;
  if (!key || key.trim() === '') {
    throw new StripeConfigError(
      'STRIPE_SECRET_KEY ausente. Define a variável de ambiente antes de chamar getStripeClient().',
    );
  }
  return key;
}

/**
 * Cliente Stripe singleton. Instâncias partilham a mesma config dentro
 * do mesmo processo Node.
 *
 * @example
 *   import { getStripeClient } from '@beauty-saas/billing/stripe';
 *
 *   const stripe = getStripeClient();
 *   const customer = await stripe.customers.create({ email: '...' });
 */
export function getStripeClient(options: StripeClientOptions = {}): Stripe {
  const secretKey = resolveSecretKey(options.secretKey);

  const apiVersion =
    options.apiVersion === 'sdk-default' || options.apiVersion === undefined
      ? PINNED_STRIPE_API_VERSION
      : options.apiVersion;

  const cacheKey = JSON.stringify({
    secretKey: hashKey(secretKey),
    apiVersion,
    appInfo: options.appInfo,
  });

  if (cached && cachedOptionsKey === cacheKey) {
    return cached;
  }

  cached = new Stripe(secretKey, {
    apiVersion: apiVersion as Stripe.LatestApiVersion,
    appInfo: options.appInfo,
    typescript: true,
    maxNetworkRetries: 2,
    timeout: 30_000,
  });
  cachedOptionsKey = cacheKey;
  return cached;
}

/** Hash rápido para chave de cache — não usamos o secret directamente. */
function hashKey(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

/**
 * Lê `STRIPE_WEBHOOK_SECRET` do ambiente. Falha determinística se ausente.
 */
export function getWebhookSecret(override?: string): string {
  const secret = override ?? process.env['STRIPE_WEBHOOK_SECRET'];
  if (!secret || secret.trim() === '') {
    throw new StripeConfigError(
      'STRIPE_WEBHOOK_SECRET ausente. Define a variável de ambiente.',
    );
  }
  return secret;
}

/** Erro de configuração. Distincto de erros do Stripe SDK. */
export class StripeConfigError extends Error {
  readonly httpStatus = 500;
  constructor(message: string) {
    super(message);
    this.name = 'StripeConfigError';
  }
}

/**
 * Reset do cache interno. Usado em testes para garantir que cada teste
 * começa com um cliente limpo.
 */
export function __resetStripeClientForTests(): void {
  cached = null;
  cachedOptionsKey = null;
}
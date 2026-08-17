/**
 * Módulo de sessão para o wizard de onboarding.
 *
 * Assina payloads com HMAC-SHA256 (Node `crypto`) usando uma chave
 * simétrica lida de `process.env.ONBOARDING_SESSION_SECRET`.
 *
 * Formato do cookie: `<base64url(payload)>.<base64url(signature)>`.
 *
 * Limites:
 *  - max-age 7 dias
 *  - exp em segundos epoch (canónico)
 *  - cookie name canónico: `onboarding_session`
 *
 * NOTA: este módulo usa `node:crypto`. Para o middleware (Edge runtime),
 * existe um espelho Web Crypto em `./session-edge.ts` que partilha o
 * mesmo formato de cookie.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface SessionPayload {
  /** ownerUserId (UUID). */
  readonly sub: string;
  /** tenantId (UUID). */
  readonly tenantId: string;
  /** Issued at — epoch seconds. */
  readonly iat: number;
  /** Expiration — epoch seconds. */
  readonly exp: number;
}

export const SESSION_COOKIE_NAME = 'onboarding_session';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 dias
const MIN_SECRET_BYTES = 32;

export interface SessionCookieParts {
  readonly cookieName: string;
  readonly cookieValue: string;
  readonly expiresAt: Date;
}

export interface DestroyedCookie {
  readonly cookieName: string;
  readonly cookieValue: string;
}

function getSecret(): Buffer {
  const raw = process.env['ONBOARDING_SESSION_SECRET'];
  if (!raw || raw.length < MIN_SECRET_BYTES) {
    throw new Error(
      `ONBOARDING_SESSION_SECRET ausente ou com menos de ${MIN_SECRET_BYTES} bytes. ` +
        `Gera com: openssl rand -base64 32`,
    );
  }
  return Buffer.from(raw, 'utf8');
}

function b64urlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf
    .toString('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  return Buffer.from(padded, 'base64');
}

function sign(body: string, secret: Buffer): string {
  return b64urlEncode(createHmac('sha256', secret).update(body).digest());
}

export async function createSession(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
): Promise<SessionCookieParts> {
  const secret = getSecret();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + SESSION_MAX_AGE_SECONDS;
  const full: SessionPayload = { ...payload, iat, exp };

  const body = b64urlEncode(JSON.stringify(full));
  const sig = sign(body, secret);

  return {
    cookieName: SESSION_COOKIE_NAME,
    cookieValue: `${body}.${sig}`,
    expiresAt: new Date(exp * 1000),
  };
}

export async function readSession(
  cookieValue: string | undefined,
): Promise<SessionPayload | null> {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];

  const secret = getSecret();
  const expected = sign(body, secret);

  // timing-safe equal
  let sigBuf: Buffer;
  let expBuf: Buffer;
  try {
    sigBuf = b64urlDecode(sig);
    expBuf = b64urlDecode(expected);
  } catch {
    return null;
  }
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;

  let decoded: SessionPayload;
  try {
    decoded = JSON.parse(b64urlDecode(body).toString('utf8')) as SessionPayload;
  } catch {
    return null;
  }

  if (
    typeof decoded?.sub !== 'string' ||
    typeof decoded?.tenantId !== 'string'
  ) {
    return null;
  }
  if (typeof decoded.exp !== 'number' || decoded.exp <= 0) return null;
  if (decoded.exp <= Math.floor(Date.now() / 1000)) return null;

  return decoded;
}

export async function destroySession(): Promise<DestroyedCookie> {
  // max-age=0 + value vazia = remoção imediata pelo browser.
  return {
    cookieName: SESSION_COOKIE_NAME,
    cookieValue: '',
  };
}

/**
 * Serializa o cookie pronto para o cabeçalho Set-Cookie.
 * Helper partilhado entre as API routes e o middleware.
 */
export interface CookieSerializeOptions {
  readonly name: string;
  readonly value: string;
  readonly maxAgeSeconds?: number;
  readonly httpOnly?: boolean;
  readonly secure?: boolean;
  readonly sameSite?: 'Strict' | 'Lax' | 'None';
  readonly path?: string;
}

export function serializeSessionCookie(opts: CookieSerializeOptions): string {
  const parts = [`${opts.name}=${opts.value}`];
  const maxAge = opts.maxAgeSeconds ?? SESSION_MAX_AGE_SECONDS;
  parts.push(`Max-Age=${maxAge}`);
  parts.push(`Path=${opts.path ?? '/'}`);
  if (opts.httpOnly ?? true) parts.push('HttpOnly');
  if (opts.secure ?? false) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite ?? 'Lax'}`);
  return parts.join('; ');
}

/**
 * Versão "destruição" do helper acima — usada em logout / sessão expirada.
 */
export function serializeSessionCookieDestroy(name: string): string {
  return `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`;
}

/** Utilitário interno: gera um segredo válido para dev. Não usar em produção. */
export function generateDevSecret(): string {
  return randomBytes(32).toString('base64');
}

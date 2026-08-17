/**
 * Variante Edge-runtime do módulo de sessão.
 *
 * Espelha `session.ts` (Node `crypto`) mas usa `Web Crypto` (`subtle`) —
 * compatível com o runtime Edge do Next.js Middleware.
 *
 * IMPORTANTE: o formato do cookie é idêntico ao `session.ts` — qualquer
 * cookie gerado por um é válido no outro (ver `session.test.ts`).
 */
import type { SessionPayload } from './session';
import {
  SESSION_COOKIE_NAME,
  type SessionCookieParts,
  type DestroyedCookie,
} from './session';

const MIN_SECRET_BYTES = 32;
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function getSecretBytes(): Uint8Array {
  const raw = process.env['ONBOARDING_SESSION_SECRET'];
  if (!raw || raw.length < MIN_SECRET_BYTES) {
    throw new Error(
      `ONBOARDING_SESSION_SECRET ausente ou com menos de ${MIN_SECRET_BYTES} bytes.`,
    );
  }
  return new TextEncoder().encode(raw);
}

function b64urlEncodeBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');
  return b64.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlEncodeString(s: string): string {
  return b64urlEncodeBytes(new TextEncoder().encode(s));
}

function b64urlDecodeToBytes(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad);
  const binary =
    typeof atob === 'function'
      ? atob(padded)
      : Buffer.from(padded, 'base64').toString('binary');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importHmacKey(secret: Uint8Array): Promise<CryptoKey> {
  // Copiamos para um ArrayBuffer isolado para satisfazer BufferSource (TS 5.9).
  const buf = new ArrayBuffer(secret.byteLength);
  new Uint8Array(buf).set(secret);
  return crypto.subtle.importKey(
    'raw',
    buf,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

async function sign(body: string, secret: Uint8Array): Promise<string> {
  const key = await importHmacKey(secret);
  const bytes = new TextEncoder().encode(body);
  // Copiamos para um ArrayBuffer isolado para satisfazer BufferSource.
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const sig = await crypto.subtle.sign('HMAC', key, buf);
  return b64urlEncodeBytes(new Uint8Array(sig));
}

export async function readSessionEdge(
  cookieValue: string | undefined,
): Promise<SessionPayload | null> {
  if (!cookieValue || typeof cookieValue !== 'string') return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];

  const secret = getSecretBytes();
  const expectedSig = await sign(body, secret);

  // Timing-safe-ish: comparar byte-a-byte sem short-circuit.
  let sigBytes: Uint8Array;
  let expBytes: Uint8Array;
  try {
    sigBytes = b64urlDecodeToBytes(sig);
    expBytes = b64urlDecodeToBytes(expectedSig);
  } catch {
    return null;
  }
  if (sigBytes.length !== expBytes.length) return null;
  let diff = 0;
  for (let i = 0; i < sigBytes.length; i++) {
    diff |= sigBytes[i]! ^ expBytes[i]!;
  }
  if (diff !== 0) return null;

  let decoded: SessionPayload;
  try {
    const bodyBytes = b64urlDecodeToBytes(body);
    const json = new TextDecoder().decode(bodyBytes);
    decoded = JSON.parse(json) as SessionPayload;
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

/** Helper de criação (Edge) — devolve cookie pronto a usar. */
export async function createSessionEdge(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
): Promise<SessionCookieParts> {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + SESSION_MAX_AGE_SECONDS;
  const full: SessionPayload = { ...payload, iat, exp };
  const body = b64urlEncodeString(JSON.stringify(full));
  const sig = await sign(body, getSecretBytes());
  return {
    cookieName: SESSION_COOKIE_NAME,
    cookieValue: `${body}.${sig}`,
    expiresAt: new Date(exp * 1000),
  };
}

export async function destroySessionEdge(): Promise<DestroyedCookie> {
  return { cookieName: SESSION_COOKIE_NAME, cookieValue: '' };
}

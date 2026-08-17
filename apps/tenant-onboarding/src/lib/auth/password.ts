/**
 * Módulo de password — hash + verificação com PBKDF2-SHA512.
 *
 * PBKDF2 é nativo do `node:crypto` (não precisamos de libs externas) e
 * configurado para 100_000 iterações com salt de 16 bytes — alinhado com
 * OWASP Password Storage Cheat Sheet (2023+).
 *
 * Formato do hash: `pbkdf2$<iterations>$<salt-b64>$<digest-b64>` — auto-
 * contido, fácil de parsear, e versionável (caso queiramos migrar para
 * argon2 no futuro).
 *
 * Critérios de força:
 *  - >= 12 caracteres
 *  - pelo menos 1 minúscula
 *  - pelo menos 1 maiúscula
 *  - pelo menos 1 dígito
 *  - pelo menos 1 símbolo (!@#$%^&*-_+=)
 */
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const DIGEST_BYTES = 32;
const KEYLEN = DIGEST_BYTES;
const DIGEST = 'sha512';

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== 'string' || plain.length === 0) {
    throw new Error('Password inválido');
  }
  const salt = randomBytes(SALT_BYTES);
  const digest = pbkdf2Sync(plain, salt, ITERATIONS, KEYLEN, DIGEST);
  return [
    'pbkdf2',
    String(ITERATIONS),
    salt.toString('base64'),
    digest.toString('base64'),
  ].join('$');
}

export async function verifyPassword(
  plain: string,
  hashed: string,
): Promise<boolean> {
  if (typeof plain !== 'string' || typeof hashed !== 'string') return false;
  const parts = hashed.split('$');
  if (parts.length !== 4) return false;
  const [scheme, iterRaw, saltB64, digestB64] = parts as [
    string,
    string,
    string,
    string,
  ];
  if (scheme !== 'pbkdf2') return false;
  const iterations = Number(iterRaw);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  let saltBuf: Buffer;
  let expected: Buffer;
  try {
    saltBuf = Buffer.from(saltB64, 'base64');
    expected = Buffer.from(digestB64, 'base64');
  } catch {
    return false;
  }
  if (saltBuf.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = pbkdf2Sync(plain, saltBuf, iterations, expected.length, DIGEST);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

const SYMBOL_REGEX = /[!@#$%^&*_\-+=]/;

export function passwordIsStrongEnough(plain: string): boolean {
  if (typeof plain !== 'string') return false;
  if (plain.length < 12) return false;
  if (!/[a-z]/.test(plain)) return false;
  if (!/[A-Z]/.test(plain)) return false;
  if (!/[0-9]/.test(plain)) return false;
  if (!SYMBOL_REGEX.test(plain)) return false;
  return true;
}

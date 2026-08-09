/**
 * Helpers de UUID v4 client-side (sem dependências externas).
 *
 * Usado para gerar `tenantId` em pré-checkout. Persistido no localStorage
 * para reconciliação no webhook (cliente→tenant).
 *
 * Por que não usar crypto.randomUUID() directamente: em browsers antigos
 * (Safari < 15.4) não está disponível. Mantemos o fallback para máxima
 * compatibilidade com o futuro Safari de utilizadores menos técnicos.
 */

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

/** Gera um UUID v4 (RFC 4122). */
export function generateUuidV4(): string {
  // Preferir a API moderna quando disponível.
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  // Fallback: 128 bits de aleatoriedade via getRandomValues.
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

const STORAGE_KEY = 'beauty-saas:tenantId';

/**
 * Devolve o tenantId persistente (localStorage) ou gera um novo.
 * Garante que é UUID v4 válido antes de devolver.
 */
export function getOrCreateTenantId(): string {
  if (typeof window === 'undefined') {
    // SSR — devolver determinístico para evitar mismatch de hydration.
    // Na prática, esta função só é chamada de client components.
    return '00000000-0000-4000-8000-000000000000';
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && isValidUuid(stored)) {
      return stored;
    }
  } catch {
    // localStorage indisponível (modo privado em alguns browsers) — ignorar.
  }

  const fresh = generateUuidV4();
  try {
    window.localStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    // Ignorar — o utilizador pode subscrever mas a reconciliação no
    // webhook falhará (cairá no fluxo de criação de tenant).
  }
  return fresh;
}
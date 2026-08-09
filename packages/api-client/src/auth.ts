/**
 * Módulo de autenticação: login, logout, me, register.
 *
 * Sanctum SPA: a sessão fica num cookie httpOnly e os pedidos seguintes
 * viajam com `credentials: 'include'`. CSRF é tratado pelo HttpClient.
 */
import { z } from 'zod';
import type { TenantUser, Uuid } from '@beauty-saas/contracts';
import { userWireToDomain } from './mappers.js';
import {
  WireLoginResponseSchema,
  WireMeResponseSchema,
  WireRegisterResponseSchema,
} from './schemas/api.js';
import type { HttpClient } from './client.js';

export interface AuthApi {
  /** Inicia sessão. CSRF é garantido antes pelo HttpClient. */
  login(input: { email: string; password: string }): Promise<TenantUser>;
  /** Termina a sessão e limpa a cache de CSRF. */
  logout(): Promise<void>;
  /** Devolve o utilizador autenticado (ou lança ApiError 401). */
  me(tenantId: Uuid): Promise<TenantUser>;
  /** Regista um novo utilizador (default role: client). */
  register(input: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
  }): Promise<TenantUser>;
}

export function createAuthModule(client: HttpClient): AuthApi {
  return {
    async login(input) {
      const res = await client.post<z.infer<typeof WireLoginResponseSchema>>(
        '/v1/auth/login',
        input,
        {
          noTenantHeader: true,
          responseSchema: WireLoginResponseSchema,
        },
      );
      return userWireToDomain(res.user, tenantIdFromEmail(res.user.email));
    },

    async logout() {
      await client.post<{ message: string }>(
        '/v1/auth/logout',
        undefined,
        { noTenantHeader: true, responseSchema: z.object({ message: z.string() }) },
      );
      client.resetCsrf();
    },

    async me(tenantId) {
      const res = await client.get<z.infer<typeof WireMeResponseSchema>>(
        '/v1/auth/me',
        { noTenantHeader: true, responseSchema: WireMeResponseSchema },
      );
      return userWireToDomain(res.user, tenantId);
    },

    async register(input) {
      const res = await client.post<z.infer<typeof WireRegisterResponseSchema>>(
        '/v1/auth/register',
        input,
        {
          noTenantHeader: true,
          responseSchema: WireRegisterResponseSchema,
        },
      );
      return userWireToDomain(res.user, tenantIdFromEmail(res.user.email));
    },
  };
}

/** Placeholder: enquanto não há tenant resolver, derivamos um UUID do email. */
function tenantIdFromEmail(email: string): Uuid {
  // Hash simples só para gerar UUID estável — não é segurança.
  let h = 0;
  for (let i = 0; i < email.length; i++) {
    h = (h * 31 + email.charCodeAt(i)) >>> 0;
  }
  const hex = h.toString(16).padStart(8, '0');
  return `00000000-0000-0000-0000-${hex}` as Uuid;
}

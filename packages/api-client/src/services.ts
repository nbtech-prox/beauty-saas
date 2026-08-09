/**
 * Módulo de serviços — listar (público) e detalhe.
 */
import { z } from 'zod';
import type { Service } from '@beauty-saas/contracts';
import { serviceWireToDomain } from './mappers.js';
import { WireServiceSchema, WireServiceListResponseSchema } from './schemas/api.js';
import type { HttpClient } from './client.js';
import type { Uuid } from './mappers.js';

export interface ServicesApi {
  list(opts?: { active?: boolean; bookable?: boolean }): Promise<Service[]>;
  get(slug: string, tenantId?: Uuid): Promise<Service>;
}

export function createServicesModule(client: HttpClient, tenantId: Uuid): ServicesApi {
  return {
    async list(opts = {}) {
      const res = await client.get<z.infer<typeof WireServiceListResponseSchema>>(
        '/v1/services',
        {
          query: {
            active: opts.active,
            bookable: opts.bookable,
          },
          responseSchema: WireServiceListResponseSchema,
        },
      );
      return res.data.map((s) => serviceWireToDomain(s, tenantId));
    },

    async get(slug, overrideTenantId) {
      const res = await client.get<{ data: z.infer<typeof WireServiceSchema> }>(
        `/v1/services/${encodeURIComponent(slug)}`,
        { responseSchema: z.object({ data: WireServiceSchema }) },
      );
      return serviceWireToDomain(res.data, overrideTenantId ?? tenantId);
    },
  };
}

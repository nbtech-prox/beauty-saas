/**
 * Módulo de profissionais.
 */
import { z } from 'zod';
import { WireProfessionalListResponseSchema, WireProfessionalSchema } from './schemas/api.js';
import type { ProfessionalDomain } from './mappers.js';
import { professionalWireToDomain } from './mappers.js';
import type { HttpClient } from './client.js';
import type { Uuid } from './mappers.js';

export interface ProfessionalsApi {
  list(): Promise<ProfessionalDomain[]>;
  get(id: number): Promise<ProfessionalDomain>;
}

export function createProfessionalsModule(
  client: HttpClient,
  tenantId: Uuid,
): ProfessionalsApi {
  return {
    async list() {
      const res = await client.get<z.infer<typeof WireProfessionalListResponseSchema>>(
        '/v1/professionals',
        { responseSchema: WireProfessionalListResponseSchema },
      );
      return res.data.map((p) => professionalWireToDomain(p, tenantId));
    },

    async get(id) {
      const res = await client.get<{ data: z.infer<typeof WireProfessionalSchema> }>(
        `/v1/professionals/${id}`,
        { responseSchema: z.object({ data: WireProfessionalSchema }) },
      );
      return professionalWireToDomain(res.data, tenantId);
    },
  };
}

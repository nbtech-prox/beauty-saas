/**
 * Módulo de horário do estabelecimento.
 */
import { z } from 'zod';
import { WireBusinessHoursResponseSchema } from './schemas/api.js';
import {
  businessHourWireToDomain,
  type BusinessHourDomain,
} from './mappers.js';
import type { HttpClient } from './client.js';

export interface BusinessHoursApi {
  get(): Promise<BusinessHourDomain[]>;
}

export function createBusinessHoursModule(client: HttpClient): BusinessHoursApi {
  return {
    async get() {
      const res = await client.get<z.infer<typeof WireBusinessHoursResponseSchema>>(
        '/v1/business-hours',
        { responseSchema: WireBusinessHoursResponseSchema },
      );
      return res.data.map(businessHourWireToDomain);
    },
  };
}

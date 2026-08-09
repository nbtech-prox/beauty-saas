/**
 * Módulo de disponibilidade — slots livres para um serviço+data.
 */
import { z } from 'zod';
import {
  WireAvailabilitySlotsResponseSchema,
  type WireAvailabilitySlotGroup,
  type WireIntId,
} from './schemas/api.js';
import { availabilityWireToDomain, type AvailabilitySlotsDomain } from './mappers.js';
import type { HttpClient } from './client.js';
import type { Uuid } from './mappers.js';

export interface AvailabilityApi {
  slots(input: {
    serviceId: WireIntId;
    date: string; // YYYY-MM-DD
    professionalId?: WireIntId;
  }): Promise<AvailabilitySlotsDomain>;
}

export function createAvailabilityModule(
  client: HttpClient,
  _tenantId: Uuid,
): AvailabilityApi {
  return {
    async slots({ serviceId, date, professionalId }) {
      const res = await client.get<z.infer<typeof WireAvailabilitySlotsResponseSchema>>(
        '/v1/availability/slots',
        {
          query: {
            service_id: serviceId,
            date,
            professional_id: professionalId,
          },
          responseSchema: WireAvailabilitySlotsResponseSchema,
        },
      );
      return availabilityWireToDomain(
        res.data as ReadonlyArray<WireAvailabilitySlotGroup>,
        serviceId,
        date,
      );
    },
  };
}

/**
 * Módulo de marcações — operações do cliente autenticado.
 *
 * Para operações admin (confirmar, cancelar, check-in, etc.) há um módulo
 * separado ou ficam para um PR futuro.
 */
import { z } from 'zod';
import type { Appointment } from '@beauty-saas/contracts';
import { appointmentWireToDomain } from './mappers.js';
import {
  WireAppointmentResponseSchema,
  WireMyAppointmentsResponseSchema,
} from './schemas/api.js';
import type { HttpClient } from './client.js';
import type { Uuid } from './mappers.js';

export interface AppointmentsApi {
  myAppointments(page?: number): Promise<PaginatedAppointments>;
  create(input: {
    serviceId: number;
    professionalId: number;
    date: string; // YYYY-MM-DD
    time: string; // HH:mm
    notes?: string;
  }): Promise<Appointment>;
  cancel(id: number, reason?: string): Promise<Appointment>;
}

export interface PaginatedAppointments {
  data: Appointment[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number | null;
  to: number | null;
}

export function createAppointmentsModule(
  client: HttpClient,
  tenantId: Uuid,
): AppointmentsApi {
  return {
    async myAppointments(page = 1) {
      const res = await client.get<z.infer<typeof WireMyAppointmentsResponseSchema>>(
        '/v1/appointments',
        {
          query: { page },
          responseSchema: WireMyAppointmentsResponseSchema,
        },
      );
      return mapPaginated(res, tenantId);
    },

    async create(input) {
      const res = await client.post<z.infer<typeof WireAppointmentResponseSchema>>(
        '/v1/appointments',
        input,
        { responseSchema: WireAppointmentResponseSchema },
      );
      return appointmentWireToDomain(res.data, tenantId);
    },

    async cancel(id, reason) {
      const res = await client.post<z.infer<typeof WireAppointmentResponseSchema>>(
        `/v1/appointments/${id}/cancel`,
        reason ? { reason } : undefined,
        { responseSchema: WireAppointmentResponseSchema },
      );
      return appointmentWireToDomain(res.data, tenantId);
    },
  };
}

function mapPaginated(
  wire: z.infer<typeof WireMyAppointmentsResponseSchema>,
  tenantId: Uuid,
): PaginatedAppointments {
  return {
    data: wire.data.map((a) => appointmentWireToDomain(a, tenantId)),
    current_page: wire.current_page,
    last_page: wire.last_page,
    per_page: wire.per_page,
    total: wire.total,
    from: wire.from ?? null,
    to: wire.to ?? null,
  };
}

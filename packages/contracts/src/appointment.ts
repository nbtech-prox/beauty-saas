/**
 * Appointment = booking de um serviço por um cliente.
 *
 * A tabela vive em `joycehairbeauty` (`appointments`), mas o schema é
 * partilhado aqui para que o `api-client` possa validar responses
 * cross-system sem acoplar ao data plane.
 *
 * ## Lifecycle
 *
 * ```
 * pending → confirmed → checked_in → completed
 *    ↓          ↓
 *  canceled  no_show
 *    ↓
 * (requester / salon / system)
 * ```
 *
 * ## Timezone
 *
 * Todos os timestamps são em UTC ISO 8601. O tenant tem o seu próprio
 * timezone (ver TenantSchema) e a UI faz a conversão.
 */
import { z } from 'zod';
import { IsoDateString, UuidSchema } from './common.js';

/** Estado do appointment. */
export const AppointmentStatusSchema = z.enum([
  'pending', // criado, aguarda aprovação (se requiresApproval)
  'confirmed', // confirmado (auto ou manual)
  'checked_in', // cliente chegou
  'completed', // serviço prestado
  'canceled', // cancelado (por cliente, salão ou sistema)
  'no_show', // cliente não apareceu
]);
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>;

/** Quem cancelou. */
export const AppointmentCanceledBySchema = z.enum([
  'client',
  'salon',
  'system', // ex.: timeout de pending
]);
export type AppointmentCanceledBy = z.infer<typeof AppointmentCanceledBySchema>;

/** Schema completo do Appointment (resposta da API). */
export const AppointmentSchema = z.object({
  id: UuidSchema,
  tenantId: UuidSchema,
  /** ID do cliente final. */
  endUserId: UuidSchema,
  /** ID do serviço agendado. */
  serviceId: UuidSchema,
  /** ID do profissional atribuído (pode mudar antes de confirmed). */
  professionalId: UuidSchema.nullable(),
  /** ID da location (multi-location feature). */
  locationId: UuidSchema.nullable(),
  /** Início do appointment em UTC. */
  startsAt: IsoDateString,
  /** Fim do appointment em UTC (= startsAt + service.durationMinutes). */
  endsAt: IsoDateString,
  status: AppointmentStatusSchema,
  /** Notas do cliente (ex.: "preferência horário tarde"). */
  clientNotes: z.string().max(1000).nullable(),
  /** Notas internas do staff. */
  internalNotes: z.string().max(1000).nullable(),
  /** Preço final cobrado (pode diferir do preço base se houve desconto). */
  price: z.number().nonnegative().multipleOf(0.01).nullable(),
  /** Moeda (sempre EUR por agora). */
  currency: z.literal('EUR'),
  /** Quem cancelou (apenas se status=canceled). */
  canceledBy: AppointmentCanceledBySchema.nullable(),
  /** Razão do cancelamento (texto livre). */
  canceledReason: z.string().max(500).nullable(),
  /** Quando foi cancelado (null se ainda não). */
  canceledAt: IsoDateString.nullable(),
  /** Quando o cliente fez check-in (null se ainda não). */
  checkedInAt: IsoDateString.nullable(),
  /** Quando o serviço foi completado (null se ainda não). */
  completedAt: IsoDateString.nullable(),
  createdAt: IsoDateString,
  updatedAt: IsoDateString,
});
export type Appointment = z.infer<typeof AppointmentSchema>;

/**
 * Refinamento cross-field:
 * - endsAt > startsAt
 * - se status=canceled → canceledBy + canceledAt obrigatórios
 * - se status=checked_in → checkedInAt obrigatório
 * - se status=completed → checkedInAt + completedAt obrigatórios
 */
export const AppointmentConsistentSchema = AppointmentSchema.superRefine((s, ctx) => {
  // ends > starts
  if (new Date(s.endsAt).getTime() <= new Date(s.startsAt).getTime()) {
    ctx.addIssue({
      code: 'custom',
      message: 'endsAt deve ser > startsAt',
      path: ['endsAt'],
    });
  }
  if (s.status === 'canceled') {
    if (!s.canceledBy) {
      ctx.addIssue({
        code: 'custom',
        message: "status='canceled' requer canceledBy",
        path: ['canceledBy'],
      });
    }
    if (!s.canceledAt) {
      ctx.addIssue({
        code: 'custom',
        message: "status='canceled' requer canceledAt",
        path: ['canceledAt'],
      });
    }
  }
  if (s.status === 'checked_in' && !s.checkedInAt) {
    ctx.addIssue({
      code: 'custom',
      message: "status='checked_in' requer checkedInAt",
      path: ['checkedInAt'],
    });
  }
  if (s.status === 'completed') {
    if (!s.checkedInAt) {
      ctx.addIssue({
        code: 'custom',
        message: "status='completed' requer checkedInAt",
        path: ['checkedInAt'],
      });
    }
    if (!s.completedAt) {
      ctx.addIssue({
        code: 'custom',
        message: "status='completed' requer completedAt",
        path: ['completedAt'],
      });
    }
  }
});

/** Payload para criar um appointment (form público de booking). */
export const AppointmentCreateInputSchema = z
  .object({
    tenantId: UuidSchema,
    serviceId: UuidSchema,
    /** Professional preferencial (opcional — backend pode reatribuir). */
    professionalId: UuidSchema.nullable().optional(),
    locationId: UuidSchema.nullable().optional(),
    /** Início em UTC. UI converte do timezone do tenant. */
    startsAt: IsoDateString,
    endUserId: UuidSchema.optional(), // null se é guest booking
    // Guest booking fields (quando endUserId ausente)
    guestName: z.string().min(1).max(100).optional(),
    guestEmail: z.string().email().max(254).optional(),
    guestPhone: z
      .string()
      .regex(/^\+?[0-9\s()-]{6,20}$/)
      .optional(),
    clientNotes: z.string().max(1000).optional(),
  })
  .refine(
    (v) => {
      // Guest booking precisa de pelo menos um contacto (email OU phone)
      if (!v.endUserId) {
        return !!(v.guestEmail || v.guestPhone);
      }
      return true;
    },
    {
      message: 'Guest booking requer guestEmail ou guestPhone',
      path: ['guestEmail'],
    },
  );
export type AppointmentCreateInput = z.infer<typeof AppointmentCreateInputSchema>;

/**
 * Actions permitidas num appointment existente.
 * Espelha os botões da UI admin: Confirmar / Cancelar / Check-in / Concluir / Faltou.
 */
export const AppointmentActionSchema = z.enum([
  'confirm', // pending → confirmed
  'cancel', // → canceled (requer canceledBy, canceledReason)
  'check_in', // confirmed → checked_in
  'complete', // checked_in → completed
  'mark_no_show', // confirmed → no_show
]);
export type AppointmentAction = z.infer<typeof AppointmentActionSchema>;

/** Payload para executar uma action. */
export const AppointmentActionInputSchema = z
  .object({
    action: AppointmentActionSchema,
    /** Razão (obrigatória em cancel). */
    reason: z.string().min(1).max(500).optional(),
  })
  .refine((v) => v.action !== 'cancel' || !!v.reason, {
    message: "action='cancel' requer reason",
    path: ['reason'],
  });
export type AppointmentActionInput = z.infer<typeof AppointmentActionInputSchema>;
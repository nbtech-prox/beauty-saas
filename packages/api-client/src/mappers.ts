/**
 * Mappers: wire format (API real) ↔ domain model (schemas `contracts`).
 *
 * Os schemas `contracts` representam o **modelo lógico** do SaaS.
 * A API `joycehairbeauty` é **single-tenant** e usa convenções próprias.
 * Estes mappers fazem a tradução na fronteira, para o resto do código
 * trabalhar sempre com o modelo lógico.
 *
 * Convenções:
 * - `id` int → string `"jhb-{id}"` (prefixo indica origem). Quando o
 *   backend Laravel ganhar `tenantId` real, este mapper converte para
 *   UUID e deixa de haver prefixo.
 * - `price_type` `from` → mantido como `fixed` com price = base.
 * - `price_type` `consult` → `consult`, price = null.
 * - status appointments `cancelled_by_client` → `canceled`+`canceledBy:client`.
 * - status appointments `cancelled_by_staff` → `canceled`+`canceledBy:salon`.
 * - status appointments `in_progress` → `checked_in` (passo intermédio).
 * - user.roles[0].name → `TenantUserRole` string.
 */
import type {
  Appointment,
  AppointmentStatus,
  AppointmentCanceledBy,
  Service,
  PriceType,
  TenantUser,
  TenantUserRole,
  EndUser,
} from '@beauty-saas/contracts';
import type { Uuid } from '@beauty-saas/contracts';
export type { Uuid };
import type {
  WireAppointment,
  WireService,
  WireUser,
  WireAvailabilitySlotGroup,
  WireBusinessHour,
  WireProfessional,
  WireIntId,
} from './schemas/api.js';

/* ──────────────────────────── ID encoding ──────────────────────────── */

/**
 * Converte um ID inteiro do joycehairbeauty para um identificador
 * estável no modelo de domínio. O prefixo `jhb-` indica que veio
 * do data plane e ainda não foi migrado para UUID.
 */
export function intIdToDomainId(id: WireIntId): Uuid {
  return `jhb-${id}` as Uuid;
}

/** Inverso: extrai o int de um ID de domínio com prefixo `jhb-`. */
export function domainIdToIntId(id: Uuid): WireIntId {
  if (typeof id !== 'string') {
    throw new TypeError(`ID de domínio inválido: ${String(id)}`);
  }
  const match = id.match(/^jhb-(\d+)$/);
  if (!match) {
    throw new RangeError(
      `ID de domínio ${id} não tem prefixo 'jhb-' — não é convertível para int`,
    );
  }
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n <= 0) {
    throw new RangeError(`ID de domínio inválido: ${id}`);
  }
  return n;
}

/** Slug para UUID de tenant (placeholder até o multi-tenant ser real). */
export function tenantSlugToUuid(slug: string): Uuid {
  // TODO: substituir por lookup real quando o tenant resolver existir.
  // Hash simples (FNV-1a de 32 bits) sobre o slug → 8 chars hex, repetidos para
  // preencher os 12 chars do último grupo. Determinístico e estável.
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const hex = h.toString(16).padStart(8, '0');
  // Repetir 8+4 para chegar a 12 chars hex (padded com zeros à direita se faltar).
  const last = (hex + hex).slice(0, 12).padEnd(12, '0');
  return `00000000-0000-0000-0000-${last}` as Uuid;
}

/* ──────────────────────────── Status mapping ──────────────────────────── */

const APPOINTMENT_STATUS_MAP: Record<string, AppointmentStatus> = {
  pending: 'pending',
  confirmed: 'confirmed',
  checked_in: 'checked_in',
  in_progress: 'checked_in', // passo intermédio → mapeado para checked_in
  completed: 'completed',
  cancelled_by_client: 'canceled',
  cancelled_by_staff: 'canceled',
  no_show: 'no_show',
};

const CANCELED_BY_MAP: Record<string, AppointmentCanceledBy> = {
  cancelled_by_client: 'client',
  cancelled_by_staff: 'salon',
};

function statusToDomain(wire: WireAppointment['status']): AppointmentStatus {
  return APPOINTMENT_STATUS_MAP[wire] ?? 'pending';
}

function canceledByToDomain(wire: WireAppointment['status']): AppointmentCanceledBy | null {
  return CANCELED_BY_MAP[wire] ?? null;
}

/* ──────────────────────────── Price type mapping ──────────────────────────── */

/**
 * Converte `price_type` real para o enum do domínio.
 *  - 'fixed'  → 'fixed' (price obrigatório)
 *  - 'from'   → 'fixed' (a API usa "from" quando o preço é mínimo; o domínio não distingue)
 *  - 'consult' → 'consult' (price = null)
 *  - (free não existe no wire — seria 'consult' sem preço)
 */
function priceTypeToDomain(wire: WireService['price_type']): PriceType {
  return wire === 'consult' ? 'consult' : 'fixed';
}

/* ──────────────────────────── Role mapping ──────────────────────────── */

const ROLE_TO_DOMAIN: Record<string, TenantUserRole> = {
  'super-admin': 'super_admin',
  super_admin: 'super_admin',
  admin: 'admin',
  manager: 'manager',
  receptionist: 'receptionist',
  professional: 'professional',
  client: 'client',
};

function roleToDomain(spatieName: string | undefined): TenantUserRole {
  if (!spatieName) return 'client';
  return ROLE_TO_DOMAIN[spatieName] ?? 'client';
}

/* ──────────────────────────── Service mapper ──────────────────────────── */

export function serviceWireToDomain(
  wire: WireService,
  tenantId: Uuid,
): Service {
  const priceType: PriceType = priceTypeToDomain(wire.price_type);
  // Para 'fixed' o wire pode trazer price=null se a regra 'consult' tiver
  // sido gravada erradamente. Garantimos consistência:
  const price = priceType === 'fixed' ? (wire.price ?? 0) : null;
  return {
    id: intIdToDomainId(wire.id),
    tenantId,
    name: wire.name,
    slug: wire.slug,
    description: wire.description ?? null,
    durationMinutes: wire.duration_minutes,
    priceType,
    price,
    currency: 'EUR',
    bufferMinutesBefore: wire.preparation_minutes ?? 0,
    bufferMinutesAfter: wire.cleanup_minutes ?? 0,
    category: wire.category?.name ?? null,
    isBookable: wire.is_bookable_online ?? wire.is_active,
    requiresApproval: false, // a API não tem este conceito; será configurável
    sortOrder: wire.order ?? 0,
    createdAt: wire.created_at ?? new Date().toISOString(),
    updatedAt: wire.updated_at ?? new Date().toISOString(),
  };
}

/* ──────────────────────────── Appointment mapper ──────────────────────────── */

export function appointmentWireToDomain(wire: WireAppointment, tenantId: Uuid): Appointment {
  const status = statusToDomain(wire.status);
  const canceledBy = canceledByToDomain(wire.status);
  const wasCanceled = wire.status === 'cancelled_by_client' || wire.status === 'cancelled_by_staff';
  return {
    id: intIdToDomainId(wire.id),
    tenantId,
    endUserId: intIdToDomainId(wire.client_id),
    serviceId: intIdToDomainId(wire.service_id),
    professionalId: wire.professional_id ? intIdToDomainId(wire.professional_id) : null,
    locationId: null, // JHB não tem multi-location ainda
    startsAt: new Date(wire.starts_at).toISOString(),
    endsAt: new Date(wire.ends_at).toISOString(),
    status,
    clientNotes: wire.client_notes ?? null,
    internalNotes: wire.internal_notes ?? null,
    price: wire.price,
    currency: 'EUR',
    canceledBy: wasCanceled ? canceledBy : null,
    canceledReason: wire.cancel_reason ?? null,
    canceledAt: wasCanceled && wire.updated_at ? new Date(wire.updated_at).toISOString() : null,
    checkedInAt:
      wire.status === 'checked_in' || wire.status === 'in_progress' || wire.status === 'completed'
        ? new Date(wire.starts_at).toISOString()
        : null,
    completedAt: wire.completed_at ? new Date(wire.completed_at).toISOString() : null,
    createdAt: wire.created_at ?? new Date().toISOString(),
    updatedAt: wire.updated_at ?? new Date().toISOString(),
  };
}

/* ──────────────────────────── User mapper ──────────────────────────── */

export function userWireToDomain(wire: WireUser, tenantId: Uuid): TenantUser {
  const role = roleToDomain(wire.roles?.[0]?.name);
  return {
    id: intIdToDomainId(wire.id),
    tenantId,
    email: wire.email,
    name: wire.name,
    role,
    permissions: 0, // calculado a partir do role; ver RBAC_MATRIX do contracts
    locale: 'pt-PT',
    avatarUrl: null,
    isActive: wire.status === 'active',
    emailVerifiedAt: wire.email_verified_at ? new Date(wire.email_verified_at).toISOString() : null,
    lastLoginAt: null,
    createdAt: new Date(wire.created_at).toISOString(),
    updatedAt: new Date(wire.updated_at).toISOString(),
  };
}

export function userWireToEndUser(wire: WireUser, tenantId: Uuid): EndUser {
  return {
    id: intIdToDomainId(wire.id),
    tenantId,
    name: wire.name,
    email: wire.email,
    phone: wire.phone ?? null,
    locale: 'pt-PT',
    notes: null,
    marketingConsent: false,
    createdAt: new Date(wire.created_at).toISOString(),
    updatedAt: new Date(wire.updated_at).toISOString(),
  };
}

/* ──────────────────────────── Availability mapper ──────────────────────────── */

export interface AvailabilitySlotsDomain {
  serviceId: Uuid;
  date: string; // YYYY-MM-DD
  groups: ReadonlyArray<{
    professionalId: Uuid;
    professionalName: string;
    slots: ReadonlyArray<string>; // HH:mm
  }>;
}

export function availabilityWireToDomain(
  wireGroups: ReadonlyArray<WireAvailabilitySlotGroup>,
  serviceId: WireIntId,
  date: string,
): AvailabilitySlotsDomain {
  return {
    serviceId: intIdToDomainId(serviceId),
    date,
    groups: wireGroups.map((g: WireAvailabilitySlotGroup) => ({
      professionalId: intIdToDomainId(g.professional_id),
      professionalName: g.professional_name,
      slots: g.slots,
    })),
  };
}

/* ──────────────────────────── Professional mapper ──────────────────────────── */

export interface ProfessionalDomain {
  id: Uuid;
  tenantId: Uuid;
  publicName: string;
  bio: string | null;
  specialties: ReadonlyArray<string>;
  isActive: boolean;
  isVisible: boolean;
  capacity: number;
  serviceIds: ReadonlyArray<Uuid>;
}

export function professionalWireToDomain(
  wire: WireProfessional,
  tenantId: Uuid,
): ProfessionalDomain {
  return {
    id: intIdToDomainId(wire.id),
    tenantId,
    publicName: wire.public_name,
    bio: wire.bio ?? null,
    specialties: wire.specialties ?? [],
    isActive: wire.is_active,
    isVisible: wire.is_visible_on_site,
    capacity: wire.capacity,
    serviceIds: (wire.services ?? []).map((s) => intIdToDomainId(s.id)),
  };
}

/* ──────────────────────────── Business hours mapper ──────────────────────────── */

export interface BusinessHourDomain {
  dayOfWeek: WireBusinessHour['day_of_week'];
  opensAt: string | null; // HH:mm
  closesAt: string | null; // HH:mm
  isClosed: boolean;
}

export function businessHourWireToDomain(wire: WireBusinessHour): BusinessHourDomain {
  return {
    dayOfWeek: wire.day_of_week,
    opensAt: wire.opens_at,
    closesAt: wire.closes_at,
    isClosed: wire.is_closed,
  };
}

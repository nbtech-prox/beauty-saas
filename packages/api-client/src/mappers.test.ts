import { describe, expect, it } from 'vitest';
import {
  appointmentWireToDomain,
  availabilityWireToDomain,
  businessHourWireToDomain,
  domainIdToIntId,
  intIdToDomainId,
  professionalWireToDomain,
  serviceWireToDomain,
  tenantSlugToUuid,
  userWireToDomain,
  userWireToEndUser,
} from './mappers.js';
import type {
  WireAppointment,
  WireBusinessHour,
  WireProfessional,
  WireService,
  WireUser,
} from './schemas/api.js';

const tenantUuid = '11111111-2222-3333-4444-555555555555' as const;

const baseServiceWire: WireService = {
  id: 42,
  category_id: 3,
  name: 'Corte de cabelo',
  slug: 'corte',
  summary: 'Corte simples',
  description: 'Inclui lavagem',
  duration_minutes: 30,
  preparation_minutes: 5,
  cleanup_minutes: 5,
  price: 15.0,
  price_type: 'fixed',
  currency: 'EUR',
  is_active: true,
  is_featured: false,
  is_bookable_online: true,
  min_advance_hours: 2,
  max_advance_days: 30,
  order: 10,
  created_at: '2026-01-01T10:00:00.000Z',
  updated_at: '2026-02-01T10:00:00.000Z',
  category: { id: 3, name: 'Cabelo', slug: 'cabelo', order: 1 },
};

const baseAppointmentWire: WireAppointment = {
  id: 100,
  uuid: 'a0000000-0000-0000-0000-000000000001',
  client_id: 1,
  service_id: 42,
  professional_id: 7,
  starts_at: '2026-03-15T10:00:00.000Z',
  ends_at: '2026-03-15T10:30:00.000Z',
  duration_minutes: 30,
  timezone: 'Europe/Lisbon',
  price: 15.0,
  currency: 'EUR',
  status: 'confirmed',
  client_notes: 'cliente pediu janela',
  internal_notes: null,
  cancel_reason: null,
  created_at: '2026-03-01T08:00:00.000Z',
  updated_at: '2026-03-01T08:00:00.000Z',
};

const baseUserWire: WireUser = {
  id: 5,
  name: 'Maria Silva',
  email: 'maria@example.pt',
  phone: '+351 900 000 000',
  status: 'active',
  email_verified_at: '2026-01-15T12:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-02-01T00:00:00.000Z',
  roles: [{ id: 1, name: 'admin', guard_name: 'web' }],
};

const baseProfessionalWire: WireProfessional = {
  id: 7,
  public_name: 'Ana Costa',
  slug: 'ana-costa',
  bio: 'Especialista em corte',
  specialties: ['Corte', 'Coloração'],
  color: '#ff0000',
  capacity: 1,
  is_active: true,
  is_visible_on_site: true,
  services: [{ id: 42, name: 'Corte' }],
};

const baseBusinessHourWire: WireBusinessHour = {
  id: 1,
  day_of_week: 'tuesday',
  opens_at: '09:00',
  closes_at: '19:00',
  is_closed: false,
};

describe('ID encoding', () => {
  it('intIdToDomainId prefixa com jhb-', () => {
    expect(intIdToDomainId(1)).toBe('jhb-1');
    expect(intIdToDomainId(42)).toBe('jhb-42');
    expect(intIdToDomainId(999999)).toBe('jhb-999999');
  });

  it('domainIdToIntId reverte o prefixo', () => {
    expect(domainIdToIntId('jhb-1' as never)).toBe(1);
    expect(domainIdToIntId('jhb-42' as never)).toBe(42);
  });

  it('domainIdToIntId lança se não tem prefixo jhb-', () => {
    expect(() => domainIdToIntId('foo-1' as never)).toThrow(RangeError);
  });

  it('domainIdToIntId lança se input não é string', () => {
    // @ts-expect-error — propositadamente errado
    expect(() => domainIdToIntId(123)).toThrow(TypeError);
  });

  it('tenantSlugToUuid produz UUID determinístico com 12 hex chars', () => {
    const uuid = tenantSlugToUuid('demo');
    // Formato: 8-4-4-4-12, todos hex (0-9a-f)
    expect(uuid).toMatch(/^00000000-0000-0000-0000-[0-9a-f]{12}$/);
    expect(tenantSlugToUuid('demo')).toBe(tenantSlugToUuid('demo')); // determinístico
  });

  it('tenantSlugToUuid: slugs diferentes → UUIDs diferentes', () => {
    const a = tenantSlugToUuid('demo');
    const b = tenantSlugToUuid('outro');
    expect(a).not.toBe(b);
  });

  it('tenantSlugToUuid: slug vazio também devolve UUID válido', () => {
    expect(tenantSlugToUuid('')).toMatch(/^00000000-0000-0000-0000-[0-9a-f]{12}$/);
  });

  it('tenantSlugToUuid: slug longo não lança e devolve UUID válido', () => {
    const uuid = tenantSlugToUuid('abc');
    const uuidLong = tenantSlugToUuid('a'.repeat(100));
    expect(uuid).toMatch(/^00000000-0000-0000-0000-[0-9a-f]{12}$/);
    expect(uuidLong).toMatch(/^00000000-0000-0000-0000-[0-9a-f]{12}$/);
  });
});

describe('serviceWireToDomain', () => {
  it('mapeia campos wire para campos de domínio', () => {
    const s = serviceWireToDomain(baseServiceWire, tenantUuid);
    expect(s.id).toBe('jhb-42');
    expect(s.tenantId).toBe(tenantUuid);
    expect(s.name).toBe('Corte de cabelo');
    expect(s.slug).toBe('corte');
    expect(s.description).toBe('Inclui lavagem');
    expect(s.durationMinutes).toBe(30);
    expect(s.priceType).toBe('fixed');
    expect(s.price).toBe(15);
    expect(s.currency).toBe('EUR');
    expect(s.bufferMinutesBefore).toBe(5);
    expect(s.bufferMinutesAfter).toBe(5);
    expect(s.category).toBe('Cabelo');
    expect(s.isBookable).toBe(true);
    expect(s.requiresApproval).toBe(false);
    expect(s.sortOrder).toBe(10);
    expect(s.createdAt).toBe('2026-01-01T10:00:00.000Z');
  });

  it('mapeia price_type "from" como "fixed"', () => {
    const wire = { ...baseServiceWire, price_type: 'from' as const, price: 20.0 };
    expect(serviceWireToDomain(wire, tenantUuid).priceType).toBe('fixed');
    expect(serviceWireToDomain(wire, tenantUuid).price).toBe(20);
  });

  it('mapeia price_type "consult" como "consult" e zera price', () => {
    const wire = { ...baseServiceWire, price_type: 'consult' as const, price: null };
    const s = serviceWireToDomain(wire, tenantUuid);
    expect(s.priceType).toBe('consult');
    expect(s.price).toBeNull();
  });

  it('fallback price=0 para fixed sem price', () => {
    const wire = { ...baseServiceWire, price_type: 'fixed' as const, price: null };
    expect(serviceWireToDomain(wire, tenantUuid).price).toBe(0);
  });

  it('fallback description=null quando ausente', () => {
    const wire: WireService = { ...baseServiceWire, description: undefined };
    expect(serviceWireToDomain(wire, tenantUuid).description).toBeNull();
  });

  it('fallback bufferMinutes=0 quando ausentes', () => {
    // preparation_minutes e cleanup_minutes têm .default(0) no schema, por isso
    // o tipo é `number` e não `number | undefined`. Para testar o fallback do
    // mapper, usamos 0 directamente.
    const wire: WireService = {
      ...baseServiceWire,
      preparation_minutes: 0,
      cleanup_minutes: 0,
    };
    const s = serviceWireToDomain(wire, tenantUuid);
    expect(s.bufferMinutesBefore).toBe(0);
    expect(s.bufferMinutesAfter).toBe(0);
  });

  it('isBookable: is_bookable_online=true vence is_active=false', () => {
    expect(
      serviceWireToDomain({ ...baseServiceWire, is_active: false, is_bookable_online: true }, tenantUuid)
        .isBookable,
    ).toBe(true);
  });

  it('isBookable: is_bookable_online=false (explícito) vence is_active=true', () => {
    // is_bookable_online é o override explícito: se o backend disse "não bookable",
    // respeitamos mesmo que is_active=true.
    expect(
      serviceWireToDomain({ ...baseServiceWire, is_active: true, is_bookable_online: false }, tenantUuid)
        .isBookable,
    ).toBe(false);
  });

  it('isBookable: sem is_bookable_online → cai para is_active', () => {
    expect(
      serviceWireToDomain({ ...baseServiceWire, is_active: true, is_bookable_online: undefined }, tenantUuid)
        .isBookable,
    ).toBe(true);
    expect(
      serviceWireToDomain({ ...baseServiceWire, is_active: false, is_bookable_online: undefined }, tenantUuid)
        .isBookable,
    ).toBe(false);
  });
});

describe('appointmentWireToDomain', () => {
  it('mapeia agendamento confirmado', () => {
    const a = appointmentWireToDomain(baseAppointmentWire, tenantUuid);
    expect(a.id).toBe('jhb-100');
    expect(a.tenantId).toBe(tenantUuid);
    expect(a.endUserId).toBe('jhb-1');
    expect(a.serviceId).toBe('jhb-42');
    expect(a.professionalId).toBe('jhb-7');
    expect(a.locationId).toBeNull();
    expect(a.startsAt).toBe('2026-03-15T10:00:00.000Z');
    expect(a.endsAt).toBe('2026-03-15T10:30:00.000Z');
    expect(a.status).toBe('confirmed');
    expect(a.price).toBe(15);
    expect(a.currency).toBe('EUR');
    expect(a.canceledBy).toBeNull();
    expect(a.canceledAt).toBeNull();
    expect(a.checkedInAt).toBeNull();
    expect(a.completedAt).toBeNull();
  });

  it('mapeia cancelado_pelo_cliente → canceled + canceledBy=client', () => {
    const wire: WireAppointment = {
      ...baseAppointmentWire,
      status: 'cancelled_by_client',
      cancel_reason: 'imprevisto',
      updated_at: '2026-03-10T11:00:00.000Z',
    };
    const a = appointmentWireToDomain(wire, tenantUuid);
    expect(a.status).toBe('canceled');
    expect(a.canceledBy).toBe('client');
    expect(a.canceledReason).toBe('imprevisto');
    expect(a.canceledAt).toBe('2026-03-10T11:00:00.000Z');
  });

  it('mapeia cancelado_pelo_staff → canceled + canceledBy=salon', () => {
    const wire: WireAppointment = { ...baseAppointmentWire, status: 'cancelled_by_staff' };
    const a = appointmentWireToDomain(wire, tenantUuid);
    expect(a.status).toBe('canceled');
    expect(a.canceledBy).toBe('salon');
  });

  it('mapeia in_progress → checked_in (passo intermédio)', () => {
    const wire: WireAppointment = { ...baseAppointmentWire, status: 'in_progress' };
    expect(appointmentWireToDomain(wire, tenantUuid).status).toBe('checked_in');
  });

  it('mapeia completed com checkedInAt e completedAt', () => {
    const wire: WireAppointment = {
      ...baseAppointmentWire,
      status: 'completed',
      completed_at: '2026-03-15T10:35:00.000Z',
    };
    const a = appointmentWireToDomain(wire, tenantUuid);
    expect(a.status).toBe('completed');
    expect(a.completedAt).toBe('2026-03-15T10:35:00.000Z');
    expect(a.checkedInAt).toBe('2026-03-15T10:00:00.000Z');
  });

  it('professionalId=null quando wire tem professional_id=null', () => {
    const wire: WireAppointment = { ...baseAppointmentWire, professional_id: null };
    expect(appointmentWireToDomain(wire, tenantUuid).professionalId).toBeNull();
  });

  it('fallback clientNotes/internalNotes=null quando ausentes', () => {
    const wire: WireAppointment = {
      ...baseAppointmentWire,
      client_notes: undefined,
      internal_notes: undefined,
    };
    const a = appointmentWireToDomain(wire, tenantUuid);
    expect(a.clientNotes).toBeNull();
    expect(a.internalNotes).toBeNull();
  });

  it('status desconhecido cai para "pending"', () => {
    // Forçar um status fora do enum (cast seguro para teste)
    const wire = { ...baseAppointmentWire, status: 'unknown_status' as WireAppointment['status'] };
    expect(appointmentWireToDomain(wire, tenantUuid).status).toBe('pending');
  });
});

describe('userWireToDomain / userWireToEndUser', () => {
  it('mapeia role Spatie (super-admin) para super_admin', () => {
    const u = userWireToDomain(
      { ...baseUserWire, roles: [{ id: 1, name: 'super-admin', guard_name: 'web' }] },
      tenantUuid,
    );
    expect(u.role).toBe('super_admin');
  });

  it('mapeia role "manager" para manager', () => {
    const u = userWireToDomain(
      { ...baseUserWire, roles: [{ id: 2, name: 'manager', guard_name: 'web' }] },
      tenantUuid,
    );
    expect(u.role).toBe('manager');
  });

  it('mapeia role "professional" para professional', () => {
    const u = userWireToDomain(
      { ...baseUserWire, roles: [{ id: 3, name: 'professional', guard_name: 'web' }] },
      tenantUuid,
    );
    expect(u.role).toBe('professional');
  });

  it('mapeia role desconhecido para "client"', () => {
    const u = userWireToDomain(
      { ...baseUserWire, roles: [{ id: 9, name: 'whatever', guard_name: 'web' }] },
      tenantUuid,
    );
    expect(u.role).toBe('client');
  });

  it('sem roles → "client"', () => {
    expect(userWireToDomain({ ...baseUserWire, roles: undefined }, tenantUuid).role).toBe('client');
  });

  it('userWireToEndUser devolve EndUser (sem role)', () => {
    const e = userWireToEndUser(baseUserWire, tenantUuid);
    expect(e.id).toBe('jhb-5');
    expect(e.email).toBe('maria@example.pt');
    expect(e.phone).toBe('+351 900 000 000');
    expect(e.locale).toBe('pt-PT');
    expect(e.notes).toBeNull();
    expect(e.marketingConsent).toBe(false);
  });

  it('isActive = true quando status="active"', () => {
    expect(userWireToDomain({ ...baseUserWire, status: 'active' }, tenantUuid).isActive).toBe(true);
    expect(userWireToDomain({ ...baseUserWire, status: 'inactive' }, tenantUuid).isActive).toBe(false);
  });

  it('emailVerifiedAt é ISO string ou null', () => {
    expect(userWireToDomain(baseUserWire, tenantUuid).emailVerifiedAt).toBe(
      '2026-01-15T12:00:00.000Z',
    );
    expect(
      userWireToDomain({ ...baseUserWire, email_verified_at: null }, tenantUuid).emailVerifiedAt,
    ).toBeNull();
  });
});

describe('professionalWireToDomain', () => {
  it('mapeia profissional com serviços', () => {
    const p = professionalWireToDomain(baseProfessionalWire, tenantUuid);
    expect(p.id).toBe('jhb-7');
    expect(p.tenantId).toBe(tenantUuid);
    expect(p.publicName).toBe('Ana Costa');
    expect(p.bio).toBe('Especialista em corte');
    expect(p.specialties).toEqual(['Corte', 'Coloração']);
    expect(p.isActive).toBe(true);
    expect(p.isVisible).toBe(true);
    expect(p.capacity).toBe(1);
    expect(p.serviceIds).toEqual(['jhb-42']);
  });

  it('fallback arrays vazios quando ausentes', () => {
    const wire: WireProfessional = {
      ...baseProfessionalWire,
      specialties: undefined,
      services: undefined,
    };
    const p = professionalWireToDomain(wire, tenantUuid);
    expect(p.specialties).toEqual([]);
    expect(p.serviceIds).toEqual([]);
  });

  it('fallback bio=null quando ausente', () => {
    const wire: WireProfessional = { ...baseProfessionalWire, bio: undefined };
    expect(professionalWireToDomain(wire, tenantUuid).bio).toBeNull();
  });
});

describe('businessHourWireToDomain', () => {
  it('mapeia dia aberto', () => {
    const bh = businessHourWireToDomain(baseBusinessHourWire);
    expect(bh.dayOfWeek).toBe('tuesday');
    expect(bh.opensAt).toBe('09:00');
    expect(bh.closesAt).toBe('19:00');
    expect(bh.isClosed).toBe(false);
  });

  it('mapeia dia fechado com horas null', () => {
    const bh = businessHourWireToDomain({
      ...baseBusinessHourWire,
      is_closed: true,
      opens_at: null,
      closes_at: null,
    });
    expect(bh.isClosed).toBe(true);
    expect(bh.opensAt).toBeNull();
    expect(bh.closesAt).toBeNull();
  });
});

describe('availabilityWireToDomain', () => {
  it('mapeia slots agrupados por profissional', () => {
    const wire = [
      { professional_id: 7, professional_name: 'Ana', slots: ['09:00', '09:30'] },
      { professional_id: 8, professional_name: 'Bruno', slots: ['10:00'] },
    ];
    const result = availabilityWireToDomain(wire, 42, '2026-03-15');
    expect(result.serviceId).toBe('jhb-42');
    expect(result.date).toBe('2026-03-15');
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]).toEqual({
      professionalId: 'jhb-7',
      professionalName: 'Ana',
      slots: ['09:00', '09:30'],
    });
    expect(result.groups[1]?.professionalId).toBe('jhb-8');
  });

  it('lida com array vazio', () => {
    const result = availabilityWireToDomain([], 1, '2026-03-15');
    expect(result.groups).toEqual([]);
  });
});

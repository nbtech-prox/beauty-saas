import { describe, expect, it } from 'vitest';
import {
  AppointmentActionInputSchema,
  AppointmentActionSchema,
  AppointmentConsistentSchema,
  AppointmentCreateInputSchema,
  AppointmentSchema,
  AppointmentStatusSchema,
} from './appointment.js';

const baseAppointment = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  tenantId: '660e8400-e29b-41d4-a716-446655440000',
  endUserId: '770e8400-e29b-41d4-a716-446655440000',
  serviceId: '880e8400-e29b-41d4-a716-446655440000',
  professionalId: null,
  locationId: null,
  startsAt: '2026-08-15T10:00:00.000Z',
  endsAt: '2026-08-15T10:30:00.000Z',
  status: 'pending' as const,
  clientNotes: null,
  internalNotes: null,
  price: 25.0,
  currency: 'EUR' as const,
  canceledBy: null,
  canceledReason: null,
  canceledAt: null,
  checkedInAt: null,
  completedAt: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

describe('AppointmentSchema', () => {
  it('parses a pending appointment', () => {
    const parsed = AppointmentSchema.parse(baseAppointment);
    expect(parsed.status).toBe('pending');
  });

  it('parses a confirmed appointment', () => {
    const parsed = AppointmentSchema.parse({ ...baseAppointment, status: 'confirmed' });
    expect(parsed.status).toBe('confirmed');
  });

  it('rejects invalid status', () => {
    expect(() => AppointmentSchema.parse({ ...baseAppointment, status: 'archived' as any })).toThrow();
  });
});

describe('AppointmentConsistentSchema (cross-field)', () => {
  it('accepts pending appointment (no timestamps required)', () => {
    expect(() => AppointmentConsistentSchema.parse(baseAppointment)).not.toThrow();
  });

  it('rejects endsAt <= startsAt', () => {
    expect(() =>
      AppointmentConsistentSchema.parse({
        ...baseAppointment,
        startsAt: '2026-08-15T10:30:00.000Z',
        endsAt: '2026-08-15T10:30:00.000Z',
      }),
    ).toThrow(/endsAt/);
  });

  it('rejects canceled without canceledBy', () => {
    expect(() =>
      AppointmentConsistentSchema.parse({
        ...baseAppointment,
        status: 'canceled',
        canceledAt: '2026-08-15T08:00:00.000Z',
        canceledBy: null,
      }),
    ).toThrow(/canceledBy/);
  });

  it('rejects canceled without canceledAt', () => {
    expect(() =>
      AppointmentConsistentSchema.parse({
        ...baseAppointment,
        status: 'canceled',
        canceledBy: 'client',
        canceledAt: null,
      }),
    ).toThrow(/canceledAt/);
  });

  it('accepts canceled with both canceledBy and canceledAt', () => {
    expect(() =>
      AppointmentConsistentSchema.parse({
        ...baseAppointment,
        status: 'canceled',
        canceledBy: 'client',
        canceledAt: '2026-08-15T08:00:00.000Z',
        canceledReason: 'cliente adoeceu',
      }),
    ).not.toThrow();
  });

  it('rejects checked_in without checkedInAt', () => {
    expect(() =>
      AppointmentConsistentSchema.parse({
        ...baseAppointment,
        status: 'checked_in',
      }),
    ).toThrow(/checkedInAt/);
  });

  it('accepts checked_in with checkedInAt', () => {
    expect(() =>
      AppointmentConsistentSchema.parse({
        ...baseAppointment,
        status: 'checked_in',
        checkedInAt: '2026-08-15T09:55:00.000Z',
      }),
    ).not.toThrow();
  });

  it('rejects completed without checkedInAt', () => {
    expect(() =>
      AppointmentConsistentSchema.parse({
        ...baseAppointment,
        status: 'completed',
        completedAt: '2026-08-15T10:35:00.000Z',
      }),
    ).toThrow(/checkedInAt/);
  });

  it('rejects completed without completedAt', () => {
    expect(() =>
      AppointmentConsistentSchema.parse({
        ...baseAppointment,
        status: 'completed',
        checkedInAt: '2026-08-15T09:55:00.000Z',
      }),
    ).toThrow(/completedAt/);
  });

  it('accepts fully completed appointment', () => {
    expect(() =>
      AppointmentConsistentSchema.parse({
        ...baseAppointment,
        status: 'completed',
        checkedInAt: '2026-08-15T09:55:00.000Z',
        completedAt: '2026-08-15T10:35:00.000Z',
      }),
    ).not.toThrow();
  });
});

describe('AppointmentStatusSchema', () => {
  it.each(['pending', 'confirmed', 'checked_in', 'completed', 'canceled', 'no_show'] as const)(
    'accepts %s',
    (s) => {
      expect(AppointmentStatusSchema.parse(s)).toBe(s);
    },
  );
});

describe('AppointmentCreateInputSchema', () => {
  it('parses existing-user booking', () => {
    const parsed = AppointmentCreateInputSchema.parse({
      tenantId: baseAppointment.tenantId,
      serviceId: baseAppointment.serviceId,
      startsAt: baseAppointment.startsAt,
      endUserId: baseAppointment.endUserId,
    });
    expect(parsed.professionalId).toBeUndefined();
  });

  it('parses guest booking with email', () => {
    const parsed = AppointmentCreateInputSchema.parse({
      tenantId: baseAppointment.tenantId,
      serviceId: baseAppointment.serviceId,
      startsAt: baseAppointment.startsAt,
      guestName: 'Visitante',
      guestEmail: 'visitante@example.com',
    });
    expect(parsed.guestName).toBe('Visitante');
  });

  it('rejects guest booking without email or phone', () => {
    expect(() =>
      AppointmentCreateInputSchema.parse({
        tenantId: baseAppointment.tenantId,
        serviceId: baseAppointment.serviceId,
        startsAt: baseAppointment.startsAt,
        guestName: 'Visitante',
      }),
    ).toThrow(/guestEmail|guestPhone/);
  });
});

describe('AppointmentActionSchema', () => {
  it.each(['confirm', 'cancel', 'check_in', 'complete', 'mark_no_show'] as const)(
    'accepts action %s',
    (a) => {
      expect(AppointmentActionSchema.parse(a)).toBe(a);
    },
  );
});

describe('AppointmentActionInputSchema', () => {
  it('parses confirm (no reason needed)', () => {
    const parsed = AppointmentActionInputSchema.parse({ action: 'confirm' });
    expect(parsed.reason).toBeUndefined();
  });

  it('rejects cancel without reason', () => {
    expect(() => AppointmentActionInputSchema.parse({ action: 'cancel' })).toThrow(/reason/);
  });

  it('accepts cancel with reason', () => {
    const parsed = AppointmentActionInputSchema.parse({
      action: 'cancel',
      reason: 'cliente cancelou',
    });
    expect(parsed.reason).toBe('cliente cancelou');
  });
});
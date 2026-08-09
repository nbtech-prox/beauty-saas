import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { HttpClient } from './client.js';
import { createAppointmentsModule } from './appointments.js';
import { createAuthModule } from './auth.js';
import { createAvailabilityModule } from './availability.js';
import { createBusinessHoursModule } from './business-hours.js';
import { createCategoriesModule } from './categories.js';
import { createContentModule } from './content.js';
import { createProfessionalsModule } from './professionals.js';
import { createServicesModule } from './services.js';
import { tenantSlugToUuid } from './mappers.js';

const tenantId = tenantSlugToUuid('demo');

/**
 * Mock do HttpClient: substitui `get`/`post` por vi.fn() que devolvem
 * o que o teste configurar. Mantém a interface mínima.
 */
function mockClient(overrides: Partial<HttpClient> = {}): HttpClient {
  const stub: HttpClient = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    request: vi.fn(),
    resetCsrf: vi.fn(),
    ...overrides,
  } as unknown as HttpClient;
  return stub;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ──────────────────────── auth ──────────────────────── */

describe('auth module', () => {
  it('login: POST /v1/auth/login com body, sem X-Tenant-Slug, devolve TenantUser', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({
        message: 'ok',
        user: {
          id: 1,
          name: 'Ana',
          email: 'ana@example.pt',
          status: 'active',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          roles: [{ id: 1, name: 'admin', guard_name: 'web' }],
        },
      }),
    });

    const auth = createAuthModule(client);
    const user = await auth.login({ email: 'ana@example.pt', password: 'secret' });

    expect(user.email).toBe('ana@example.pt');
    expect(user.role).toBe('admin');
    expect(client.post).toHaveBeenCalledWith(
      '/v1/auth/login',
      { email: 'ana@example.pt', password: 'secret' },
      expect.objectContaining({ noTenantHeader: true, responseSchema: expect.any(z.ZodType) }),
    );
  });

  it('logout: POST, sem tenant, e chama resetCsrf()', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({ message: 'logged out' }),
    });

    const auth = createAuthModule(client);
    await auth.logout();

    expect(client.post).toHaveBeenCalledWith(
      '/v1/auth/logout',
      undefined,
      expect.objectContaining({ noTenantHeader: true }),
    );
    expect(client.resetCsrf).toHaveBeenCalledTimes(1);
  });

  it('me: GET /v1/auth/me sem tenant, devolve TenantUser com tenantId do caller', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        user: {
          id: 2,
          name: 'Bruno',
          email: 'bruno@example.pt',
          status: 'active',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          roles: [{ id: 2, name: 'manager', guard_name: 'web' }],
        },
      }),
    });

    const auth = createAuthModule(client);
    const user = await auth.me(tenantId);

    expect(user.email).toBe('bruno@example.pt');
    expect(user.role).toBe('manager');
    expect(user.tenantId).toBe(tenantId);
    expect(client.get).toHaveBeenCalledWith(
      '/v1/auth/me',
      expect.objectContaining({ noTenantHeader: true, responseSchema: expect.any(z.ZodType) }),
    );
  });

  it('register: POST com password_confirmation, devolve TenantUser', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({
        message: 'created',
        user: {
          id: 3,
          name: 'Carla',
          email: 'carla@example.pt',
          status: 'active',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          roles: [{ id: 3, name: 'client', guard_name: 'web' }],
        },
      }),
    });

    const auth = createAuthModule(client);
    const user = await auth.register({
      name: 'Carla',
      email: 'carla@example.pt',
      password: 'x',
      password_confirmation: 'x',
    });

    expect(user.role).toBe('client');
    expect(client.post).toHaveBeenCalledWith(
      '/v1/auth/register',
      {
        name: 'Carla',
        email: 'carla@example.pt',
        password: 'x',
        password_confirmation: 'x',
      },
      expect.objectContaining({ noTenantHeader: true }),
    );
  });
});

/* ──────────────────────── services ──────────────────────── */

describe('services module', () => {
  it('list: GET /v1/services com query params opcionais, mapeia para Service[]', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: 1,
            name: 'Corte',
            slug: 'corte',
            description: null,
            duration_minutes: 30,
            preparation_minutes: 0,
            cleanup_minutes: 0,
            price: 10,
            price_type: 'fixed',
            currency: 'EUR',
            is_active: true,
            is_bookable_online: true,
          },
        ],
      }),
    });

    const services = createServicesModule(client, tenantId);
    const result = await services.list({ active: true, bookable: true });

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('jhb-1');
    expect(result[0]?.priceType).toBe('fixed');
    expect(result[0]?.price).toBe(10);
    expect(client.get).toHaveBeenCalledWith(
      '/v1/services',
      expect.objectContaining({
        query: { active: true, bookable: true },
        responseSchema: expect.any(z.ZodType),
      }),
    );
  });

  it('list sem opts: query vazia', async () => {
    const client = mockClient({ get: vi.fn().mockResolvedValue({ data: [] }) });
    const services = createServicesModule(client, tenantId);
    await services.list();

    expect(client.get).toHaveBeenCalledWith(
      '/v1/services',
      expect.objectContaining({ query: { active: undefined, bookable: undefined } }),
    );
  });

  it('get: GET /v1/services/:slug (encoded), com override tenantId', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: {
          id: 1,
          name: 'Corte',
          slug: 'corte',
          description: null,
          duration_minutes: 30,
          preparation_minutes: 0,
          cleanup_minutes: 0,
          price: 10,
          price_type: 'fixed',
          currency: 'EUR',
          is_active: true,
        },
      }),
    });

    const services = createServicesModule(client, tenantId);
    const override = tenantSlugToUuid('other');
    const s = await services.get('corte de cabelo', override);

    expect(s.id).toBe('jhb-1');
    expect(s.tenantId).toBe(override);
    expect(client.get).toHaveBeenCalledWith(
      '/v1/services/corte%20de%20cabelo',
      expect.objectContaining({ responseSchema: expect.any(z.ZodType) }),
    );
  });
});

/* ──────────────────────── categories ──────────────────────── */

describe('categories module', () => {
  it('list: GET /v1/categories, mapeia para ServiceCategory[]', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [
          { id: 1, name: 'Cabelo', slug: 'cabelo', description: 'Cortes', order: 1, is_active: true },
          { id: 2, name: 'Estética', slug: 'estetica', description: null, order: 2, is_active: false },
        ],
      }),
    });

    const categories = createCategoriesModule(client);
    const result = await categories.list();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      id: 1,
      name: 'Cabelo',
      slug: 'cabelo',
      description: 'Cortes',
      order: 1,
      isActive: true,
    });
    expect(result[1]?.description).toBeNull();
    expect(result[1]?.isActive).toBe(false);
    expect(client.get).toHaveBeenCalledWith(
      '/v1/categories',
      expect.objectContaining({ responseSchema: expect.any(z.ZodType) }),
    );
  });
});

/* ──────────────────────── professionals ──────────────────────── */

describe('professionals module', () => {
  it('list: GET /v1/professionals, mapeia para ProfessionalDomain[]', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: 7,
            public_name: 'Ana',
            bio: null,
            specialties: [],
            capacity: 1,
            is_active: true,
            is_visible_on_site: true,
            services: [{ id: 1, name: 'Corte' }],
          },
        ],
      }),
    });

    const professionals = createProfessionalsModule(client, tenantId);
    const result = await professionals.list();

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('jhb-7');
    expect(result[0]?.publicName).toBe('Ana');
    expect(result[0]?.serviceIds).toEqual(['jhb-1']);
  });

  it('get: GET /v1/professionals/:id, devolve um só', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: {
          id: 7,
          public_name: 'Ana',
          bio: 'Bio',
          specialties: ['Corte'],
          capacity: 1,
          is_active: true,
          is_visible_on_site: true,
        },
      }),
    });

    const professionals = createProfessionalsModule(client, tenantId);
    const p = await professionals.get(7);

    expect(p.id).toBe('jhb-7');
    expect(p.bio).toBe('Bio');
    expect(client.get).toHaveBeenCalledWith(
      '/v1/professionals/7',
      expect.objectContaining({ responseSchema: expect.any(z.ZodType) }),
    );
  });
});

/* ──────────────────────── appointments ──────────────────────── */

describe('appointments module', () => {
  it('myAppointments: GET /v1/appointments com page, mapeia para PaginatedAppointments', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: 1,
            client_id: 1,
            service_id: 1,
            professional_id: 1,
            starts_at: '2026-03-15T10:00:00.000Z',
            ends_at: '2026-03-15T10:30:00.000Z',
            duration_minutes: 30,
            timezone: 'Europe/Lisbon',
            price: 10,
            currency: 'EUR',
            status: 'confirmed',
            created_at: '2026-03-01T00:00:00.000Z',
            updated_at: '2026-03-01T00:00:00.000Z',
          },
        ],
        current_page: 1,
        last_page: 1,
        per_page: 15,
        total: 1,
        from: 1,
        to: 1,
      }),
    });

    const appointments = createAppointmentsModule(client, tenantId);
    const result = await appointments.myAppointments(1);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.status).toBe('confirmed');
    expect(result.current_page).toBe(1);
    expect(result.from).toBe(1);
    expect(client.get).toHaveBeenCalledWith(
      '/v1/appointments',
      expect.objectContaining({
        query: { page: 1 },
        responseSchema: expect.any(z.ZodType),
      }),
    );
  });

  it('myAppointments: from/to null quando ausentes', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [],
        current_page: 1,
        last_page: 1,
        per_page: 15,
        total: 0,
      }),
    });

    const appointments = createAppointmentsModule(client, tenantId);
    const result = await appointments.myAppointments();

    expect(result.from).toBeNull();
    expect(result.to).toBeNull();
  });

  it('create: POST /v1/appointments com body, devolve Appointment', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({
        data: {
          id: 5,
          client_id: 1,
          service_id: 1,
          professional_id: 2,
          starts_at: '2026-03-15T10:00:00.000Z',
          ends_at: '2026-03-15T10:30:00.000Z',
          duration_minutes: 30,
          timezone: 'Europe/Lisbon',
          price: 10,
          currency: 'EUR',
          status: 'pending',
          created_at: '2026-03-01T00:00:00.000Z',
          updated_at: '2026-03-01T00:00:00.000Z',
        },
      }),
    });

    const appointments = createAppointmentsModule(client, tenantId);
    const created = await appointments.create({
      serviceId: 1,
      professionalId: 2,
      date: '2026-03-15',
      time: '10:00',
      notes: 'cliente pediu janela',
    });

    expect(created.id).toBe('jhb-5');
    expect(created.status).toBe('pending');
    expect(client.post).toHaveBeenCalledWith(
      '/v1/appointments',
      {
        serviceId: 1,
        professionalId: 2,
        date: '2026-03-15',
        time: '10:00',
        notes: 'cliente pediu janela',
      },
      expect.objectContaining({ responseSchema: expect.any(z.ZodType) }),
    );
  });

  it('cancel: POST /v1/appointments/:id/cancel sem reason, devolve Appointment', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({
        data: {
          id: 5,
          client_id: 1,
          service_id: 1,
          professional_id: 2,
          starts_at: '2026-03-15T10:00:00.000Z',
          ends_at: '2026-03-15T10:30:00.000Z',
          duration_minutes: 30,
          timezone: 'Europe/Lisbon',
          price: 10,
          currency: 'EUR',
          status: 'cancelled_by_client',
          cancel_reason: null,
          updated_at: '2026-03-10T00:00:00.000Z',
          created_at: '2026-03-01T00:00:00.000Z',
        },
      }),
    });

    const appointments = createAppointmentsModule(client, tenantId);
    const cancelled = await appointments.cancel(5);

    expect(cancelled.status).toBe('canceled');
    expect(cancelled.canceledBy).toBe('client');
    expect(client.post).toHaveBeenCalledWith(
      '/v1/appointments/5/cancel',
      undefined,
      expect.objectContaining({ responseSchema: expect.any(z.ZodType) }),
    );
  });

  it('cancel: com reason, passa reason no body', async () => {
    const client = mockClient({
      post: vi.fn().mockResolvedValue({
        data: {
          id: 5,
          client_id: 1,
          service_id: 1,
          professional_id: 2,
          starts_at: '2026-03-15T10:00:00.000Z',
          ends_at: '2026-03-15T10:30:00.000Z',
          duration_minutes: 30,
          timezone: 'Europe/Lisbon',
          price: 10,
          currency: 'EUR',
          status: 'cancelled_by_client',
          updated_at: '2026-03-10T00:00:00.000Z',
          created_at: '2026-03-01T00:00:00.000Z',
        },
      }),
    });

    const appointments = createAppointmentsModule(client, tenantId);
    await appointments.cancel(5, 'cliente viajou');

    expect(client.post).toHaveBeenCalledWith(
      '/v1/appointments/5/cancel',
      { reason: 'cliente viajou' },
      expect.any(Object),
    );
  });
});

/* ──────────────────────── availability ──────────────────────── */

describe('availability module', () => {
  it('slots: GET /v1/availability/slots com query, mapeia para AvailabilitySlotsDomain', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [
          { professional_id: 7, professional_name: 'Ana', slots: ['09:00', '09:30'] },
          { professional_id: 8, professional_name: 'Bruno', slots: [] },
        ],
      }),
    });

    const availability = createAvailabilityModule(client, tenantId);
    const result = await availability.slots({ serviceId: 42, date: '2026-03-15' });

    expect(result.serviceId).toBe('jhb-42');
    expect(result.date).toBe('2026-03-15');
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0]?.slots).toEqual(['09:00', '09:30']);
    expect(client.get).toHaveBeenCalledWith(
      '/v1/availability/slots',
      expect.objectContaining({
        query: { service_id: 42, date: '2026-03-15', professional_id: undefined },
        responseSchema: expect.any(z.ZodType),
      }),
    );
  });

  it('slots: professionalId opcional → incluído no query', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({ data: [] }),
    });

    const availability = createAvailabilityModule(client, tenantId);
    await availability.slots({ serviceId: 1, date: '2026-03-15', professionalId: 7 });

    expect(client.get).toHaveBeenCalledWith(
      '/v1/availability/slots',
      expect.objectContaining({
        query: { service_id: 1, date: '2026-03-15', professional_id: 7 },
      }),
    );
  });
});

/* ──────────────────────── business-hours ──────────────────────── */

describe('business-hours module', () => {
  it('get: GET /v1/business-hours, mapeia para BusinessHourDomain[]', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: 1,
            day_of_week: 'tuesday',
            opens_at: '09:00',
            closes_at: '19:00',
            is_closed: false,
          },
          {
            id: 2,
            day_of_week: 'sunday',
            opens_at: null,
            closes_at: null,
            is_closed: true,
          },
        ],
      }),
    });

    const bh = createBusinessHoursModule(client);
    const result = await bh.get();

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      dayOfWeek: 'tuesday',
      opensAt: '09:00',
      closesAt: '19:00',
      isClosed: false,
    });
    expect(result[1]?.isClosed).toBe(true);
    expect(result[1]?.opensAt).toBeNull();
    expect(client.get).toHaveBeenCalledWith(
      '/v1/business-hours',
      expect.objectContaining({ responseSchema: expect.any(z.ZodType) }),
    );
  });
});

/* ──────────────────────── content ──────────────────────── */

describe('content module', () => {
  it('faqs: GET /v1/public/faqs', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [
          { id: 1, question: 'Q1', answer: 'A1', order: 1, is_published: true },
          { id: 2, question: 'Q2', answer: 'A2' },
        ],
      }),
    });

    const content = createContentModule(client);
    const result = await content.faqs();

    expect(result).toHaveLength(2);
    expect(result[0]?.isPublished).toBe(true);
    expect(result[1]?.order).toBe(0); // default
    expect(result[1]?.isPublished).toBe(true); // default
    expect(client.get).toHaveBeenCalledWith(
      '/v1/public/faqs',
      expect.objectContaining({ responseSchema: expect.any(z.ZodType) }),
    );
  });

  it('testimonials: GET /v1/public/testimonials', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: 1,
            name: 'Maria',
            rating: 5,
            text: 'Óptimo',
            is_approved: true,
            is_active: true,
            order: 2,
            created_at: '2026-02-01T00:00:00.000Z',
          },
        ],
      }),
    });

    const content = createContentModule(client);
    const result = await content.testimonials();

    expect(result).toHaveLength(1);
    expect(result[0]?.clientName).toBe('Maria');
    expect(result[0]?.content).toBe('Óptimo');
    expect(result[0]?.rating).toBe(5);
    expect(result[0]?.isApproved).toBe(true);
    expect(result[0]?.isPublished).toBe(true);
    expect(result[0]?.order).toBe(2);
    expect(result[0]?.createdAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('testimonials: rating null quando ausente; isPublished cai para is_approved', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [{ id: 1, name: 'X', text: 'Y' }],
      }),
    });

    const content = createContentModule(client);
    const result = await content.testimonials();

    expect(result[0]?.rating).toBeNull();
    expect(result[0]?.isApproved).toBe(false);
    expect(result[0]?.isPublished).toBe(false);
    expect(result[0]?.order).toBe(0); // default
  });

  it('testimonials: is_active sobrepõe-se a is_approved para isPublished', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [{ id: 1, name: 'X', text: 'Y', is_approved: true, is_active: false }],
      }),
    });

    const content = createContentModule(client);
    const result = await content.testimonials();

    // is_active (false) ganha sobre is_approved (true) — é o override operacional
    expect(result[0]?.isApproved).toBe(true);
    expect(result[0]?.isPublished).toBe(false);
  });

  it('gallery: GET /v1/public/gallery', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: [
          {
            id: 1,
            title: 'Salão',
            description: null,
            image_url: 'https://x.com/img.jpg',
            order: 1,
            is_published: true,
          },
        ],
      }),
    });

    const content = createContentModule(client);
    const result = await content.gallery();

    expect(result).toHaveLength(1);
    expect(result[0]?.imageUrl).toBe('https://x.com/img.jpg');
    expect(result[0]?.title).toBe('Salão');
  });

  it('settings: GET /v1/public/settings devolve object chave→valor', async () => {
    const client = mockClient({
      get: vi.fn().mockResolvedValue({
        data: {
          phone: '+351 900 000 000',
          capacity: 10,
          about_text: ['Primeiro parágrafo.', 'Segundo parágrafo.'],
          hero_subtitle: 'Bem-vindo',
        },
      }),
    });

    const content = createContentModule(client);
    const result = await content.settings();

    // Object plano, não array de {key, value}
    expect(result).not.toBeInstanceOf(Array);
    expect(result).toEqual({
      phone: '+351 900 000 000',
      capacity: 10,
      about_text: ['Primeiro parágrafo.', 'Segundo parágrafo.'],
      hero_subtitle: 'Bem-vindo',
    });
  });
});

/**
 * `createApiClient` — factory principal.
 *
 * Devolve um objecto com o `HttpClient` + módulos de domínio. É a única
 * coisa que o resto da app precisa de importar.
 */
import type { HttpClientConfig } from './client.js';
import { HttpClient } from './client.js';
import { tenantSlugToUuid, type Uuid } from './mappers.js';
import { createAuthModule } from './auth.js';
import { createServicesModule } from './services.js';
import { createCategoriesModule } from './categories.js';
import { createProfessionalsModule } from './professionals.js';
import { createAppointmentsModule } from './appointments.js';
import { createAvailabilityModule } from './availability.js';
import { createBusinessHoursModule } from './business-hours.js';
import { createContentModule } from './content.js';

export interface ApiClient {
  /** O HttpClient nu (para casos avançados). */
  raw: HttpClient;
  /** TenantId resolvido (derivado do slug). */
  tenantId: Uuid;
  auth: ReturnType<typeof createAuthModule>;
  services: ReturnType<typeof createServicesModule>;
  categories: ReturnType<typeof createCategoriesModule>;
  professionals: ReturnType<typeof createProfessionalsModule>;
  appointments: ReturnType<typeof createAppointmentsModule>;
  availability: ReturnType<typeof createAvailabilityModule>;
  businessHours: ReturnType<typeof createBusinessHoursModule>;
  content: ReturnType<typeof createContentModule>;
}

/**
 * Cria a instância de `ApiClient` a partir da config.
 *
 * @example
 *   const api = createApiClient({
 *     baseUrl: process.env.API_URL!,
 *     tenantSlug: 'demo',
 *   });
 *   const services = await api.services.list();
 */
export function createApiClient(config: HttpClientConfig): ApiClient {
  const raw = new HttpClient(config);
  const tenantId = tenantSlugToUuid(config.tenantSlug);
  return {
    raw,
    tenantId,
    auth: createAuthModule(raw),
    services: createServicesModule(raw, tenantId),
    categories: createCategoriesModule(raw),
    professionals: createProfessionalsModule(raw, tenantId),
    appointments: createAppointmentsModule(raw, tenantId),
    availability: createAvailabilityModule(raw, tenantId),
    businessHours: createBusinessHoursModule(raw),
    content: createContentModule(raw),
  };
}

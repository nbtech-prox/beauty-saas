import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    client: 'src/client.ts',
    errors: 'src/errors.ts',
    mappers: 'src/mappers.ts',
    'schemas/api': 'src/schemas/api.ts',
    auth: 'src/auth.ts',
    services: 'src/services.ts',
    categories: 'src/categories.ts',
    professionals: 'src/professionals.ts',
    appointments: 'src/appointments.ts',
    availability: 'src/availability.ts',
    'business-hours': 'src/business-hours.ts',
    content: 'src/content.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: 'es2022',
});

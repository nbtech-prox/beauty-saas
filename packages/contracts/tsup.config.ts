import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    common: 'src/common.ts',
    tenant: 'src/tenant.ts',
    plan: 'src/plan.ts',
    subscription: 'src/subscription.ts',
    service: 'src/service.ts',
    user: 'src/user.ts',
    location: 'src/location.ts',
    appointment: 'src/appointment.ts',
    webhook: 'src/webhook.ts',
    'audit-log': 'src/audit-log.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: 'es2022',
});
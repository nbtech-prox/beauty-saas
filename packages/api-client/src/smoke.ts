/**
 * Smoke test do @beauty-saas/api-client contra a API real do joycehairbeauty.
 *
 * Este script é manual: assume que a API está a correr.
 * Não corre no CI porque depende de um servidor externo.
 *
 * Como correr:
 *   1. cd /mnt/projetos/Sites/joycehairbeauty/apps/api && php artisan serve --port=8765
 *   2. cd /mnt/projetos/Sites/beauty-saas/packages/api-client
 *   3. pnpm smoke
 *
 * Variáveis de ambiente:
 *   SMOKE_API_URL  — base URL da API (default: http://127.0.0.1:8765)
 *   SMOKE_TENANT   — slug do tenant (default: demo)
 *
 * Cobre: health, CSRF, 7 endpoints públicos, e a expectativa de 401 em /auth/me.
 */
import { createApiClient } from './index.js';

const API_URL = process.env.SMOKE_API_URL ?? 'http://127.0.0.1:8765';
const TENANT_SLUG = process.env.SMOKE_TENANT ?? 'demo';

type CheckResult = { name: string; ok: boolean; detail: string; ms: number };
const results: CheckResult[] = [];

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail, ms: Date.now() - start });
    console.log(`  ✓ ${name} (${Date.now() - start}ms) — ${detail}`);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    results.push({ name, ok: false, detail, ms: Date.now() - start });
    console.log(`  ✗ ${name} (${Date.now() - start}ms) — ${detail}`);
  }
}

async function main() {
  console.log(`\n[smoke] ${API_URL} (tenant=${TENANT_SLUG})\n`);

  const api = createApiClient({ baseUrl: API_URL, tenantSlug: TENANT_SLUG, apiPrefix: '/api' });

  // 1. Health via fetch directo
  await check('GET /api/v1/health (direct)', async () => {
    const res = await fetch(`${API_URL}/api/v1/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { status: string; services: { database: string } };
    if (body.status !== 'ok') throw new Error(`status=${body.status}`);
    if (body.services.database !== 'healthy') throw new Error(`db=${body.services.database}`);
    return 'status=ok, db=healthy';
  });

  // 2. CSRF (público, noTenantHeader)
  await check('GET /api/v1/auth/csrf-cookie', async () => {
    await api.raw.get('/api/v1/auth/csrf-cookie', { noTenantHeader: true, noCsrf: true });
    return 'cookie devolvido';
  });

  // 3-9. Endpoints públicos via módulos de domínio
  await check('GET /api/v1/categories (list)', async () => {
    const cats = await api.categories.list();
    if (cats.length === 0) return '[]';
    return `${cats.length} categorias: ${cats.slice(0, 3).map((c) => c.name).join(', ')}…`;
  });

  await check('GET /api/v1/services (list)', async () => {
    const services = await api.services.list();
    if (services.length === 0) return '[]';
    return `${services.length} serviços: ${services.slice(0, 3).map((s) => s.name).join(', ')}…`;
  });

  await check('GET /api/v1/professionals (list)', async () => {
    const profs = await api.professionals.list();
    if (profs.length === 0) return '[]';
    return `${profs.length} profissionais`;
  });

  await check('GET /api/v1/business-hours (get)', async () => {
    const hours = await api.businessHours.get();
    if (hours.length === 0) return '[]';
    return `${hours.length} dias configurados`;
  });

  await check('GET /api/v1/public/faqs (list)', async () => {
    const faqs = await api.content.faqs();
    return `${faqs.length} FAQs`;
  });

  await check('GET /api/v1/public/testimonials (list)', async () => {
    const t = await api.content.testimonials();
    return `${t.length} testimonials`;
  });

  await check('GET /api/v1/public/gallery (list)', async () => {
    const g = await api.content.gallery();
    return `${g.length} imagens`;
  });

  await check('GET /api/v1/public/settings (list)', async () => {
    const s = await api.content.settings();
    return `${s.length} settings`;
  });

  // 10. Auth/me sem sessão → esperado 401
  await check('GET /api/v1/auth/me sem sessão (espera 401)', async () => {
    try {
      await api.auth.me(api.tenantId);
      throw new Error('200 OK inesperado — devia ser 401');
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e && (e as { status: number }).status === 401) {
        return '401 Unauthorized (esperado)';
      }
      return `erro=${e instanceof Error ? e.message : String(e)}`;
    }
  });

  // Sumário
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const total = results.length;
  const totalMs = results.reduce((sum, r) => sum + r.ms, 0);

  console.log(`\n[smoke] ${passed}/${total} verde em ${totalMs}ms (${failed} falhas)\n`);

  if (failed > 0) {
    console.log('Detalhe das falhas:');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  ✗ ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  }

  console.log('Tempos por check:');
  for (const r of results.sort((a, b) => b.ms - a.ms)) {
    console.log(`  ${r.ms.toString().padStart(4)}ms  ${r.name}`);
  }
}

main().catch((e) => {
  console.error('\n[smoke] erro fatal:', e);
  process.exit(1);
});

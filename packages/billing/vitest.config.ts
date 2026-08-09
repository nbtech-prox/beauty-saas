import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // Coverage v8 tem incompatibilidade com glob@10/minimatch@9 em
    // certas resoluções do pnpm. Activar quando vitest@3 estiver pinado.
    // Para já, cobertura via `pnpm exec vitest run --coverage` (best-effort).
    coverage: {
      enabled: false,
    },
  },
});
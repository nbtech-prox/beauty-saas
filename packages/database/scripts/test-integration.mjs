import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  buildVitestSpawnOptions,
  createHarnessLifecycle,
  runCommand,
  runIntegrationHarness,
} from "./test-integration-helpers.mjs";

const dockerTimeoutMs = 15_000;

export async function main() {
  const containerName = `beauty-saas-db-test-${randomUUID()}`;
  const docker = (...args) =>
    runCommand("docker", args, { timeoutMs: dockerTimeoutMs });
  const lifecycle = createHarnessLifecycle({
    processTarget: process,
    removeContainer: async () => {
      const removal = await docker("rm", "--force", containerName);
      if (removal.status === 0) return;
      const detail = (
        removal.stderr ||
        removal.stdout ||
        "sem detalhes"
      ).trim();
      throw new Error(
        `Não foi possível remover o PostgreSQL de teste: ${detail}`,
      );
    },
    reportError: (message) => {
      console.error(`[test-integration:cleanup] ${message}`);
    },
    exit: (code) => {
      process.exitCode = code;
    },
  });
  lifecycle.install();

  try {
    await runIntegrationHarness({
      containerName,
      buildDatabaseUrl: (port) =>
        `postgresql://postgres:***@127.0.0.1:${port}/beauty_saas_test`,
      docker,
      env: process.env,
      lifecycle,
      spawnVitest: (databaseUrl, env) =>
        spawn(
          "pnpm",
          ["exec", "vitest", "run"],
          buildVitestSpawnOptions({ ...env, TEST_DATABASE_URL: databaseUrl }),
        ),
    });
    await lifecycle.completion;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await lifecycle.finish(1, "SIGTERM");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}

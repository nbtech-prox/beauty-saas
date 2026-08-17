import { spawn } from "node:child_process";

export function runCommand(
  command,
  args,
  { spawnProcess = spawn, timeoutMs = 10_000 } = {},
) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnProcess(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(
        new Error(`Não foi possível executar ${command}: ${error.message}`, {
          cause: error,
        }),
      );
      return;
    }

    let stderr = "";
    let stdout = "";
    let settled = false;
    let timeout;
    const onStderr = (chunk) => {
      stderr += chunk.toString();
    };
    const onStdout = (chunk) => {
      stdout += chunk.toString();
    };
    const cleanup = () => {
      clearTimeout(timeout);
      child.off("close", onClose);
      child.off("error", onError);
      child.stderr.off("data", onStderr);
      child.stdout.off("data", onStdout);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onClose = (status, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ signal, status, stderr, stdout });
    };
    const onError = (error) => {
      fail(
        new Error(`Não foi possível executar ${command}: ${error.message}`, {
          cause: error,
        }),
      );
    };

    child.stderr.on("data", onStderr);
    child.stdout.on("data", onStdout);
    child.once("close", onClose);
    child.once("error", onError);
    timeout = setTimeout(() => {
      child.kill("SIGKILL");
      fail(
        new Error(`O comando ${command} excedeu o limite de ${timeoutMs} ms.`),
      );
    }, timeoutMs);
  });
}

export function waitForVitest(child) {
  return new Promise((resolve, reject) => {
    const removeListeners = () => {
      child.off("exit", onExit);
      child.off("error", onError);
    };
    const onExit = (code) => {
      removeListeners();
      resolve(code ?? 1);
    };
    const onError = (error) => {
      removeListeners();
      reject(
        new Error(`Não foi possível iniciar Vitest: ${error.message}`, {
          cause: error,
        }),
      );
    };

    child.once("exit", onExit);
    child.once("error", onError);
  });
}

export function terminateProcessGroup(
  child,
  signal,
  { graceMs = 5_000, killProcess = process.kill } = {},
) {
  if (child.exitCode !== null || child.signalCode !== null)
    return Promise.resolve();

  return new Promise((resolve) => {
    let settled = false;
    let graceTimer;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(graceTimer);
      child.off("exit", done);
      child.off("error", done);
      resolve();
    };

    child.once("exit", done);
    child.once("error", done);
    try {
      killProcess(-child.pid, signal);
      graceTimer = setTimeout(() => {
        try {
          killProcess(-child.pid, "SIGKILL");
        } catch {
          // O processo pode já ter terminado entre a graça e o SIGKILL.
        } finally {
          done();
        }
      }, graceMs);
    } catch {
      done();
    }
  });
}

export function createHarnessLifecycle({
  processTarget,
  removeContainer,
  reportError = () => {},
  exit,
  terminateChild = terminateProcessGroup,
}) {
  let child;
  let installed = false;
  let finalization;
  const pendingOperations = new Set();

  const handlers = {
    SIGINT: () => void finish(130, "SIGINT"),
    SIGTERM: () => void finish(143, "SIGTERM"),
  };

  function removeListeners() {
    if (!installed) return;
    processTarget.off("SIGINT", handlers.SIGINT);
    processTarget.off("SIGTERM", handlers.SIGTERM);
    installed = false;
  }

  function finish(code, signal) {
    if (finalization) return finalization;
    removeListeners();
    finalization = (async () => {
      let exitCode = code;
      const markCleanupFailure = (message) => {
        if (code === 0) exitCode = 1;
        try {
          reportError(message);
        } catch {
          // O reporter não pode impedir a conclusão idempotente do cleanup.
        }
      };

      if (signal && child) {
        try {
          await terminateChild(child, signal);
        } catch {
          markCleanupFailure(
            "Não foi possível terminar o processo de testes durante o cleanup.",
          );
        }
      }

      await Promise.all([...pendingOperations]);

      try {
        await removeContainer();
      } catch {
        markCleanupFailure(
          "Não foi possível remover o contentor durante o cleanup.",
        );
      }

      exit(exitCode);
    })();
    return finalization;
  }

  return {
    trackPending(operation) {
      const tracked = Promise.resolve(operation);
      const settlement = tracked.then(
        () => undefined,
        () => undefined,
      );
      pendingOperations.add(settlement);
      void settlement.finally(() => pendingOperations.delete(settlement));
      return tracked;
    },
    setChild(value) {
      child = value;
    },
    install() {
      if (installed) return;
      processTarget.on("SIGINT", handlers.SIGINT);
      processTarget.on("SIGTERM", handlers.SIGTERM);
      installed = true;
    },
    finish,
    get isFinishing() {
      return finalization !== undefined;
    },
    get completion() {
      return finalization ?? Promise.resolve();
    },
  };
}

export function buildVitestSpawnOptions(env, platform = process.platform) {
  return {
    detached: platform === "linux",
    env,
    stdio: "inherit",
  };
}

export function buildDockerRunArgs(containerName) {
  return [
    "run",
    "--detach",
    "--rm",
    "--name",
    containerName,
    "-e",
    "POSTGRES_PASSWORD=postgres",
    "-e",
    "POSTGRES_DB=beauty_saas_test",
    "-p",
    "127.0.0.1::5432",
    "postgres:17-alpine",
  ];
}

export function parsePublishedPort(output) {
  const publication = output.trim();
  const match = publication.match(
    /^(?:\[[0-9a-fA-F:.]+\]|[0-9a-fA-F:.]+):(\d+)$/,
  );
  const port = match ? Number(match[1]) : Number.NaN;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `Não foi possível interpretar a porta publicada pelo Docker: ${JSON.stringify(output)}.`,
    );
  }

  return port;
}

function requireCommandSuccess(result, context) {
  if (result.status === 0) return;
  const detail = (result.stderr || result.stdout || "sem detalhes").trim();
  throw new Error(`${context}: ${detail}`);
}

export async function runIntegrationHarness({
  containerName,
  buildDatabaseUrl,
  docker,
  env,
  lifecycle,
  spawnVitest,
  waitForTests = waitForVitest,
  delay = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  readinessAttempts = 60,
  readinessDelayMs = 500,
}) {
  const continueAfterCheckpoint = async () => {
    if (!lifecycle.isFinishing) return true;
    await lifecycle.completion;
    return false;
  };
  const runDocker = (...args) => lifecycle.trackPending(docker(...args));

  const startup = await runDocker(...buildDockerRunArgs(containerName));
  if (!(await continueAfterCheckpoint())) return;
  requireCommandSuccess(
    startup,
    "Não foi possível iniciar o PostgreSQL de teste",
  );

  const publication = await runDocker("port", containerName, "5432/tcp");
  if (!(await continueAfterCheckpoint())) return;
  requireCommandSuccess(
    publication,
    "Não foi possível obter a porta publicada pelo Docker",
  );
  const port = parsePublishedPort(publication.stdout);
  const databaseUrl = buildDatabaseUrl(port);

  let ready = false;
  for (let attempt = 0; attempt < readinessAttempts; attempt += 1) {
    const status = await runDocker(
      "exec",
      containerName,
      "pg_isready",
      "-U",
      "postgres",
      "-d",
      "beauty_saas_test",
    );
    if (!(await continueAfterCheckpoint())) return;
    if (status.status === 0) {
      ready = true;
      break;
    }

    await lifecycle.trackPending(delay(readinessDelayMs));
    if (!(await continueAfterCheckpoint())) return;
  }

  if (!ready)
    throw new Error("PostgreSQL de teste não ficou disponível a tempo.");

  if (!(await continueAfterCheckpoint())) return;
  const child = spawnVitest(databaseUrl, env);
  lifecycle.setChild(child);
  const code = await waitForTests(child);
  await lifecycle.finish(code);
}

import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  buildDockerRunArgs,
  buildVitestSpawnOptions,
  createHarnessLifecycle,
  parsePublishedPort,
  runCommand,
  runIntegrationHarness,
  terminateProcessGroup,
  waitForVitest,
} from '../scripts/test-integration-helpers.mjs';

describe('parsePublishedPort', () => {
  it('extrai a porta de uma publicação IPv4', () => {
    expect(parsePublishedPort('127.0.0.1:49153\n')).toBe(49153);
  });

  it('extrai a porta de publicações IPv6', () => {
    expect(parsePublishedPort('[::1]:49154\n')).toBe(49154);
    expect(parsePublishedPort(':::49155\n')).toBe(49155);
  });

  it.each(['', '127.0.0.1:not-a-port', '127.0.0.1:70000'])(
    'rejeita uma publicação inválida: %j',
    (output) => {
      expect(() => parsePublishedPort(output)).toThrow(
        /Não foi possível interpretar a porta publicada pelo Docker/,
      );
    },
  );
});

describe('buildDockerRunArgs', () => {
  it('pede ao Docker uma porta livre publicada apenas em localhost', () => {
    expect(buildDockerRunArgs('beauty-saas-db-test-id')).toEqual([
      'run',
      '--detach',
      '--rm',
      '--name',
      'beauty-saas-db-test-id',
      '-e',
      'POSTGRES_PASSWORD=postgres',
      '-e',
      'POSTGRES_DB=beauty_saas_test',
      '-p',
      '127.0.0.1::5432',
      'postgres:17-alpine',
    ]);
  });
});

describe('buildVitestSpawnOptions', () => {
  it('cria um grupo de processos dedicado em Linux', () => {
    const env = { TEST_DATABASE_URL: 'postgresql://teste' };

    expect(buildVitestSpawnOptions(env, 'linux')).toEqual({
      detached: true,
      env,
      stdio: 'inherit',
    });
  });
});

class FakeCommandChild extends EventEmitter {
  stderr = new EventEmitter();
  stdout = new EventEmitter();
  kill = vi.fn((_signal: NodeJS.Signals) => true);
}

describe('runCommand', () => {
  it('reporta claramente uma falha de spawn', async () => {
    const child = new FakeCommandChild();
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() =>
        child.emit('error', new Error('spawn docker ENOENT')),
      );
      return child;
    });

    await expect(
      runCommand('docker', ['version'], { spawnProcess, timeoutMs: 50 }),
    ).rejects.toThrow('Não foi possível executar docker: spawn docker ENOENT');
  });

  it('aborta e reporta um comando que excede o timeout', async () => {
    vi.useFakeTimers();
    try {
      const child = new FakeCommandChild();
      const spawnProcess = vi.fn(() => child);

      const completion = runCommand('docker', ['info'], {
        spawnProcess,
        timeoutMs: 25,
      });
      const rejection = expect(completion).rejects.toThrow(
        'O comando docker excedeu o limite de 25 ms.',
      );
      await vi.advanceTimersByTimeAsync(25);
      await rejection;

      expect(child.kill).toHaveBeenCalledOnce();
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    } finally {
      vi.useRealTimers();
    }
  });
});

class FakeChild extends EventEmitter {
  pid = 4321;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  kill = vi.fn((signal: NodeJS.Signals) => {
    queueMicrotask(() => {
      this.signalCode = signal;
      this.emit('exit', null, signal);
    });
    return true;
  });
}

describe('terminateProcessGroup', () => {
  it('sinaliza o grupo dedicado e aguarda um child cooperativo', async () => {
    const child = new FakeChild();
    const killProcess = vi.fn((_pid: number, signal: NodeJS.Signals) => {
      queueMicrotask(() => {
        child.signalCode = signal;
        child.emit('exit', null, signal);
      });
      return true;
    });

    await terminateProcessGroup(child, 'SIGTERM', { killProcess });

    expect(killProcess).toHaveBeenCalledOnce();
    expect(killProcess).toHaveBeenCalledWith(-4321, 'SIGTERM');
  });

  it('absorve ESRCH ao escalar para SIGKILL e limpa os listeners', async () => {
    vi.useFakeTimers();
    const uncaught: unknown[] = [];
    const rejected: unknown[] = [];
    const onUncaught = (error: unknown) => uncaught.push(error);
    const onRejected = (error: unknown) => rejected.push(error);
    process.on('uncaughtException', onUncaught);
    process.on('unhandledRejection', onRejected);
    try {
      const child = new FakeChild();
      const esrch = Object.assign(new Error('processo já terminou'), {
        code: 'ESRCH',
      });
      const killProcess = vi
        .fn<(_pid: number, _signal: NodeJS.Signals) => boolean>()
        .mockReturnValueOnce(true)
        .mockImplementationOnce(() => {
          throw esrch;
        });

      const completion = terminateProcessGroup(child, 'SIGTERM', {
        graceMs: 25,
        killProcess,
      });
      await vi.advanceTimersByTimeAsync(25);
      await expect(completion).resolves.toBeUndefined();

      expect(killProcess).toHaveBeenNthCalledWith(1, -4321, 'SIGTERM');
      expect(killProcess).toHaveBeenNthCalledWith(2, -4321, 'SIGKILL');
      expect(child.listenerCount('exit')).toBe(0);
      expect(child.listenerCount('error')).toBe(0);
      expect(uncaught).toEqual([]);
      expect(rejected).toEqual([]);
    } finally {
      process.off('uncaughtException', onUncaught);
      process.off('unhandledRejection', onRejected);
      vi.useRealTimers();
    }
  });
});

describe('waitForVitest', () => {
  it('reporta claramente uma falha ao iniciar o processo', async () => {
    const child = new FakeChild();
    const completion = waitForVitest(child);

    child.emit('error', new Error('spawn pnpm ENOENT'));

    await expect(completion).rejects.toThrow(
      'Não foi possível iniciar Vitest: spawn pnpm ENOENT',
    );
  });
});

describe('createHarnessLifecycle', () => {
  it('aguarda o docker run pendente antes do cleanup e bloqueia a continuação', async () => {
    const processTarget = new EventEmitter();
    const removeContainer = vi.fn();
    const continueAfterStartup = vi.fn();
    const exit = vi.fn();
    let settleDockerRun!: () => void;
    const dockerRun = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settleDockerRun = resolve;
        }),
    );
    const lifecycle = createHarnessLifecycle({
      processTarget,
      removeContainer,
      exit,
    });
    lifecycle.install();

    const startup = lifecycle.trackPending(dockerRun());
    processTarget.emit('SIGTERM');
    await Promise.resolve();

    expect(removeContainer).not.toHaveBeenCalled();
    settleDockerRun();
    await startup;
    if (!lifecycle.isFinishing) continueAfterStartup();
    await lifecycle.completion;

    expect(continueAfterStartup).not.toHaveBeenCalled();
    expect(removeContainer).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(143);
    expect(processTarget.listenerCount('SIGINT')).toBe(0);
    expect(processTarget.listenerCount('SIGTERM')).toBe(0);
  });

  it('termina o child e sai com o código de cada sinal', async () => {
    for (const [signal, expectedCode] of [
      ['SIGINT', 130],
      ['SIGTERM', 143],
    ] as const) {
      const processTarget = new EventEmitter();
      const child = new FakeChild();
      const removeContainer = vi.fn();
      const exit = vi.fn();
      const terminateChild = vi.fn().mockResolvedValue(undefined);
      const lifecycle = createHarnessLifecycle({
        processTarget,
        removeContainer,
        exit,
        terminateChild,
      });
      lifecycle.setChild(child);
      lifecycle.install();

      processTarget.emit(signal);
      await lifecycle.completion;

      expect(terminateChild).toHaveBeenCalledOnce();
      expect(terminateChild).toHaveBeenCalledWith(child, signal);
      expect(removeContainer).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledWith(expectedCode);
      expect(processTarget.listenerCount('SIGINT')).toBe(0);
      expect(processTarget.listenerCount('SIGTERM')).toBe(0);
    }
  });

  it('reporta falhas isoladas ao terminar o child e remover o contentor', async () => {
    const processTarget = new EventEmitter();
    const child = new FakeChild();
    const order: string[] = [];
    const terminateChild = vi.fn(async () => {
      order.push('terminate');
      throw new Error('terminate falhou: token=segredo-terminate');
    });
    const removeContainer = vi.fn(async () => {
      order.push('remove');
      throw new Error('docker rm falhou: password=segredo-remove');
    });
    const reportError = vi.fn((message: string) => {
      order.push(`report:${message}`);
    });
    const exit = vi.fn((code: number) => {
      order.push(`exit:${code}`);
    });
    const lifecycle = createHarnessLifecycle({
      processTarget,
      removeContainer,
      reportError,
      exit,
      terminateChild,
    });
    lifecycle.setChild(child);
    lifecycle.install();

    await expect(lifecycle.finish(0, 'SIGTERM')).resolves.toBeUndefined();
    await expect(lifecycle.completion).resolves.toBeUndefined();

    expect(order).toEqual([
      'terminate',
      'report:Não foi possível terminar o processo de testes durante o cleanup.',
      'remove',
      'report:Não foi possível remover o contentor durante o cleanup.',
      'exit:1',
    ]);
    expect(JSON.stringify(reportError.mock.calls)).not.toMatch(
      /segredo-terminate|segredo-remove/,
    );
    expect(processTarget.listenerCount('SIGINT')).toBe(0);
    expect(processTarget.listenerCount('SIGTERM')).toBe(0);
  });

  it.each([
    [0, 1],
    [2, 2],
    [130, 130],
    [143, 143],
  ])(
    'reporta uma falha de cleanup e converte o código %i em %i',
    async (originalCode, expectedCode) => {
      const processTarget = new EventEmitter();
      const removeContainer = vi
        .fn()
        .mockRejectedValue(
          new Error('docker rm falhou: password=segredo-super-secreto'),
        );
      const reportError = vi.fn();
      const exit = vi.fn();
      const lifecycle = createHarnessLifecycle({
        processTarget,
        removeContainer,
        reportError,
        exit,
      });
      lifecycle.install();

      await expect(lifecycle.finish(originalCode)).resolves.toBeUndefined();
      await expect(lifecycle.completion).resolves.toBeUndefined();
      await expect(lifecycle.finish(99)).resolves.toBeUndefined();

      expect(removeContainer).toHaveBeenCalledOnce();
      expect(reportError).toHaveBeenCalledOnce();
      expect(reportError).toHaveBeenCalledWith(
        'Não foi possível remover o contentor durante o cleanup.',
      );
      expect(JSON.stringify(reportError.mock.calls)).not.toContain(
        'segredo-super-secreto',
      );
      expect(exit).toHaveBeenCalledOnce();
      expect(exit).toHaveBeenCalledWith(expectedCode);
      expect(processTarget.listenerCount('SIGINT')).toBe(0);
      expect(processTarget.listenerCount('SIGTERM')).toBe(0);
    },
  );
});

describe('runIntegrationHarness', () => {
  it('não avança quando a finalização começa durante a obtenção da porta', async () => {
    const processTarget = new EventEmitter();
    const removeContainer = vi.fn();
    const spawnVitest = vi.fn();
    const exit = vi.fn();
    let settlePort!: (result: {
      status: number;
      stderr: string;
      stdout: string;
    }) => void;
    const port = new Promise<{
      status: number;
      stderr: string;
      stdout: string;
    }>((resolve) => {
      settlePort = resolve;
    });
    const docker = vi
      .fn()
      .mockResolvedValueOnce({ status: 0, stderr: '', stdout: 'id\n' })
      .mockReturnValueOnce(port);
    const lifecycle = createHarnessLifecycle({
      processTarget,
      removeContainer,
      exit,
    });
    lifecycle.install();

    const harness = runIntegrationHarness({
      containerName: 'contentor-teste',
      buildDatabaseUrl: (port: number) => `postgresql://teste:${port}/db`,
      docker,
      env: {},
      lifecycle,
      spawnVitest,
    });
    await Promise.resolve();
    await Promise.resolve();
    processTarget.emit('SIGTERM');
    await Promise.resolve();

    expect(removeContainer).not.toHaveBeenCalled();
    settlePort({ status: 0, stderr: '', stdout: '127.0.0.1:49153\n' });
    await harness;
    await lifecycle.completion;

    expect(docker).toHaveBeenCalledTimes(2);
    expect(spawnVitest).not.toHaveBeenCalled();
    expect(removeContainer).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(143);
  });

  it('aguarda a readiness pendente e não inicia fases posteriores após o sinal', async () => {
    const processTarget = new EventEmitter();
    const removeContainer = vi.fn();
    const spawnVitest = vi.fn();
    const delay = vi.fn();
    const exit = vi.fn();
    let settleReadiness!: (result: {
      status: number;
      stderr: string;
      stdout: string;
    }) => void;
    const readiness = new Promise<{
      status: number;
      stderr: string;
      stdout: string;
    }>((resolve) => {
      settleReadiness = resolve;
    });
    const docker = vi
      .fn()
      .mockResolvedValueOnce({ status: 0, stderr: '', stdout: 'id\n' })
      .mockResolvedValueOnce({
        status: 0,
        stderr: '',
        stdout: '127.0.0.1:49153\n',
      })
      .mockReturnValueOnce(readiness);
    const lifecycle = createHarnessLifecycle({
      processTarget,
      removeContainer,
      exit,
    });
    lifecycle.install();

    const harness = runIntegrationHarness({
      containerName: 'contentor-teste',
      buildDatabaseUrl: (port: number) => `postgresql://teste:${port}/db`,
      docker,
      env: {},
      lifecycle,
      spawnVitest,
      delay,
    });
    await vi.waitFor(() => expect(docker).toHaveBeenCalledTimes(3));
    processTarget.emit('SIGINT');
    await Promise.resolve();

    expect(removeContainer).not.toHaveBeenCalled();
    settleReadiness({ status: 1, stderr: 'a iniciar', stdout: '' });
    await harness;
    await lifecycle.completion;

    expect(docker).toHaveBeenCalledTimes(3);
    expect(delay).not.toHaveBeenCalled();
    expect(spawnVitest).not.toHaveBeenCalled();
    expect(removeContainer).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(130);
  });

  it('faz um último checkpoint imediatamente antes de iniciar Vitest', async () => {
    const child = new FakeChild();
    const spawnVitest = vi.fn(() => child);
    const finish = vi.fn().mockResolvedValue(undefined);
    const lifecycle = {
      trackPending: <T>(operation: PromiseLike<T>) =>
        Promise.resolve(operation),
      setChild: vi.fn(),
      install: vi.fn(),
      finish,
      completion: Promise.resolve(),
      get isFinishing() {
        return finish.mock.calls.length > 0;
      },
    };
    let checkpoints = 0;
    const guardedLifecycle = new Proxy(lifecycle, {
      get(target, property, receiver) {
        if (property === 'isFinishing') {
          checkpoints += 1;
          if (checkpoints === 4) void finish(143, 'SIGTERM');
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const docker = vi
      .fn()
      .mockResolvedValueOnce({ status: 0, stderr: '', stdout: 'id\n' })
      .mockResolvedValueOnce({
        status: 0,
        stderr: '',
        stdout: '127.0.0.1:49153\n',
      })
      .mockResolvedValueOnce({ status: 0, stderr: '', stdout: 'ready' });

    await runIntegrationHarness({
      containerName: 'contentor-teste',
      buildDatabaseUrl: (port: number) => `postgresql://teste:${port}/db`,
      docker,
      env: {},
      lifecycle: guardedLifecycle,
      spawnVitest,
    });

    expect(checkpoints).toBe(4);
    expect(finish).toHaveBeenCalledOnce();
    expect(spawnVitest).not.toHaveBeenCalled();
    expect(lifecycle.setChild).not.toHaveBeenCalled();
  });
});

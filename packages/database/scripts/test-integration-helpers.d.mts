import type { EventEmitter } from "node:events";

export interface CommandChildLike extends EventEmitter {
  stderr: EventEmitter;
  stdout: EventEmitter;
  kill(signal: NodeJS.Signals): boolean;
}

export interface CommandResult {
  signal: NodeJS.Signals | null;
  status: number | null;
  stderr: string;
  stdout: string;
}

export function runCommand(
  command: string,
  args: string[],
  options?: {
    spawnProcess?: (
      command: string,
      args: string[],
      options: { stdio: ["ignore", "pipe", "pipe"] },
    ) => CommandChildLike;
    timeoutMs?: number;
  },
): Promise<CommandResult>;

export interface ChildLike {
  pid: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  once(
    event: "exit",
    listener: (code: number | null, signal?: NodeJS.Signals | null) => void,
  ): unknown;
  once(event: "error", listener: (error: Error) => void): unknown;
  off(
    event: "exit",
    listener: (code: number | null, signal?: NodeJS.Signals | null) => void,
  ): unknown;
  off(event: "error", listener: (error: Error) => void): unknown;
  kill(signal: NodeJS.Signals): boolean;
}

export interface ProcessLike {
  on(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
  off(event: "SIGINT" | "SIGTERM", listener: () => void): unknown;
}

export interface HarnessLifecycle {
  trackPending<T>(operation: PromiseLike<T>): Promise<T>;
  setChild(child: ChildLike): void;
  install(): void;
  finish(code: number, signal?: NodeJS.Signals): Promise<void>;
  readonly isFinishing: boolean;
  readonly completion: Promise<void>;
}

export function waitForVitest(child: ChildLike): Promise<number>;

export function terminateProcessGroup(
  child: ChildLike,
  signal: NodeJS.Signals,
  options?: {
    graceMs?: number;
    killProcess?: (pid: number, signal: NodeJS.Signals) => boolean;
  },
): Promise<void>;

export function createHarnessLifecycle(options: {
  processTarget: ProcessLike;
  removeContainer: () => void | Promise<void>;
  reportError?: (message: string) => void;
  exit: (code: number) => void;
  terminateChild?: (
    child: ChildLike,
    signal: NodeJS.Signals,
  ) => void | Promise<void>;
}): HarnessLifecycle;

export function buildVitestSpawnOptions(
  env: NodeJS.ProcessEnv,
  platform?: NodeJS.Platform,
): {
  detached: boolean;
  env: NodeJS.ProcessEnv;
  stdio: "inherit";
};

export function buildDockerRunArgs(containerName: string): string[];
export function parsePublishedPort(output: string): number;

export function runIntegrationHarness(options: {
  containerName: string;
  buildDatabaseUrl: (port: number) => string;
  docker: (...args: string[]) => PromiseLike<CommandResult>;
  env: NodeJS.ProcessEnv;
  lifecycle: HarnessLifecycle;
  spawnVitest: (databaseUrl: string, env: NodeJS.ProcessEnv) => ChildLike;
  waitForTests?: (child: ChildLike) => Promise<number>;
  delay?: (milliseconds: number) => PromiseLike<unknown>;
  readinessAttempts?: number;
  readinessDelayMs?: number;
}): Promise<void>;

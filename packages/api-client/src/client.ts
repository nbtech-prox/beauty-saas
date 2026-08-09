/**
 * HttpClient — wrapper de `fetch` com:
 * - base URL + path
 * - X-Tenant-Slug automático (vindo de config)
 * - Cookies Sanctum (same-origin)
 * - CSRF: chama `/v1/auth/csrf-cookie` antes de POST autenticados
 * - Zod parse do body de resposta
 * - Retry exponencial para 5xx (default: 3 tentativas)
 * - Timeouts configuráveis
 * - Erros tipados (ver `errors.ts`)
 *
 * Não conhece nenhum endpoint de domínio. Os módulos (`auth`, `services`, etc.)
 * usam o `HttpClient` para fazer as chamadas e mapeiam o resultado.
 */
import { z } from 'zod';
import {
  ApiError,
  InvalidJsonError,
  NetworkError,
  ValidationError,
} from './errors.js';

/* ──────────────────────────── Tipos públicos ──────────────────────────── */

export interface HttpClientConfig {
  /** URL base da API (ex.: `https://api.joycehairbeauty.pt`). */
  baseUrl: string;
  /** Slug do tenant actual; é injectado em `X-Tenant-Slug` em todos os pedidos. */
  tenantSlug: string;
  /**
   * Prefixo do path para os endpoints versionados (default: `''`).
   * Os módulos chamam `/v1/services`, `/v1/auth/login`, etc. — o client
   * prepende este prefixo. Use `'/api'` se a API é servida com `/api/v1/...`
   * (caso do `joycehairbeauty` em produção).
   */
  apiPrefix?: string;
  /** Pedir CSRF antes de POST autenticados (default: true). Sanctum SPA. */
  withCsrf?: boolean;
  /** Timeout por tentativa, ms (default: 30 000). */
  timeoutMs?: number;
  /** Nº máximo de tentativas em 5xx (default: 3). */
  maxRetries?: number;
  /** Backoff base, ms (default: 200). Cada retry duplica. */
  retryBackoffMs?: number;
  /** Logger opcional para debugging. */
  logger?: Pick<Console, 'debug' | 'info' | 'warn' | 'error'>;
  /** Headers extra a juntar a todos os pedidos. */
  defaultHeaders?: Record<string, string>;
}

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions<TResponse> {
  method?: RequestMethod;
  /** Query string params (objeto é serializado). */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Body serializado para JSON (object, undefined = sem body). */
  body?: unknown;
  /** Headers extra (somente neste pedido). */
  headers?: Record<string, string>;
  /** Schema Zod que valida a resposta. Se omitido, devolve `unknown`. */
  responseSchema?: z.ZodType<TResponse>;
  /** Não injectar `X-Tenant-Slug`. Usar para endpoints cross-tenant (auth, etc.). */
  noTenantHeader?: boolean;
  /** Não enviar CSRF antes do POST. */
  noCsrf?: boolean;
  /** Sinal externo para abortar. */
  signal?: AbortSignal;
  /** Override do nº de tentativas só para este pedido. */
  maxRetries?: number;
}

/* ──────────────────────────── Implementação ──────────────────────────── */

export class HttpClient {
  private readonly config: Required<Omit<HttpClientConfig, 'logger' | 'defaultHeaders'>> &
    Pick<HttpClientConfig, 'logger' | 'defaultHeaders'>;
  private csrfPromise: Promise<void> | null = null;

  constructor(config: HttpClientConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/+$/, ''),
      tenantSlug: config.tenantSlug,
      apiPrefix: (config.apiPrefix ?? '').replace(/\/+$/, ''),
      withCsrf: config.withCsrf ?? true,
      timeoutMs: config.timeoutMs ?? 30_000,
      maxRetries: config.maxRetries ?? 3,
      retryBackoffMs: config.retryBackoffMs ?? 200,
      logger: config.logger,
      defaultHeaders: config.defaultHeaders,
    };
  }

  /** GET helper com schema. */
  get<T>(path: string, opts: Omit<RequestOptions<T>, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...opts, method: 'GET' });
  }

  /** POST helper com schema. */
  post<T>(path: string, body?: unknown, opts: Omit<RequestOptions<T>, 'method'> = {}): Promise<T> {
    return this.request<T>(path, { ...opts, method: 'POST', body });
  }

  /** PUT helper com schema. */
  put<T>(path: string, body?: unknown, opts: Omit<RequestOptions<T>, 'method'> = {}): Promise<T> {
    return this.request<T>(path, { ...opts, method: 'PUT', body });
  }

  /** PATCH helper com schema. */
  patch<T>(path: string, body?: unknown, opts: Omit<RequestOptions<T>, 'method'> = {}): Promise<T> {
    return this.request<T>(path, { ...opts, method: 'PATCH', body });
  }

  /** DELETE helper com schema. */
  delete<T>(path: string, opts: Omit<RequestOptions<T>, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...opts, method: 'DELETE' });
  }

  /**
   * Executa o pedido HTTP. Função principal do cliente.
   *
   * Lança:
   *  - `ValidationError` se `responseSchema` for passado e a resposta não validar.
   *  - `ApiError` em 4xx/5xx (com o body parseado).
   *  - `NetworkError` em timeout, abort, fetch falhado, JSON inválido.
   */
  async request<TResponse>(
    path: string,
    options: RequestOptions<TResponse> = {},
  ): Promise<TResponse> {
    const method = options.method ?? 'GET';
    const url = this.buildUrl(path, options.query);

    // Sanctum: para POST/PUT/PATCH/DELETE autenticados, garantir CSRF primeiro.
    if (this.config.withCsrf && !options.noCsrf && method !== 'GET' && method !== 'DELETE') {
      await this.ensureCsrf();
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(this.config.defaultHeaders ?? {}),
      ...options.headers,
    };
    if (!options.noTenantHeader) {
      headers['X-Tenant-Slug'] = this.config.tenantSlug;
    }
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const init: RequestInit = {
      method,
      headers,
      credentials: 'include', // Sanctum SPA cookies
      signal: options.signal ?? null,
    };
    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const maxRetries = options.maxRetries ?? this.config.maxRetries;
    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxRetries) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);
      // Encadear sinal externo se houver
      if (options.signal) {
        if (options.signal.aborted) {
          controller.abort();
        } else {
          options.signal.addEventListener('abort', () => controller.abort(), { once: true });
        }
      }
      try {
        const response = await fetch(url, { ...init, signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.status >= 500 && attempt < maxRetries) {
          // 5xx: retry com backoff
          attempt++;
          this.config.logger?.warn?.(
            `[api-client] ${method} ${url} → ${response.status} (retry ${attempt}/${maxRetries})`,
          );
          await sleep(this.config.retryBackoffMs * 2 ** (attempt - 1));
          continue;
        }

        // Tentar parsear JSON
        let body: unknown = null;
        const text = await response.text();
        if (text.length > 0) {
          try {
            body = JSON.parse(text);
          } catch {
            if (response.ok) {
              throw new InvalidJsonError(
                `Resposta não-JSON em ${method} ${url} (${response.status})`,
              );
            }
            body = { message: text };
          }
        }

        if (!response.ok) {
          throw new ApiError(response.status, url, method, body);
        }

        if (options.responseSchema) {
          const result = options.responseSchema.safeParse(body);
          if (!result.success) {
            const issues = result.error.issues.map((i) => ({
              path: i.path.join('.') || '(root)',
              message: i.message,
            }));
            throw new ValidationError(
              options.responseSchema.description ?? 'response',
              issues,
              `Resposta inválida em ${method} ${url}: ${issues.length} issue(s)`,
            );
          }
          return result.data as TResponse;
        }

        return body as TResponse;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof ValidationError || err instanceof ApiError || err instanceof InvalidJsonError) {
          throw err;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          lastError = err;
          if (attempt < maxRetries) {
            attempt++;
            this.config.logger?.warn?.(
              `[api-client] ${method} ${url} → aborted (retry ${attempt}/${maxRetries})`,
            );
            await sleep(this.config.retryBackoffMs * 2 ** (attempt - 1));
            continue;
          }
          throw new NetworkError(err, `Timeout/abort em ${method} ${url}`);
        }
        // Erro de rede
        lastError = err;
        if (attempt < maxRetries) {
          attempt++;
          this.config.logger?.warn?.(
            `[api-client] ${method} ${url} → ${(err as Error).message} (retry ${attempt}/${maxRetries})`,
          );
          await sleep(this.config.retryBackoffMs * 2 ** (attempt - 1));
          continue;
        }
        throw new NetworkError(err, `Falha de rede em ${method} ${url}`);
      }
    }
    // Nunca deve chegar aqui, mas por segurança
    throw new NetworkError(lastError);
  }

  /* ──────────────────────────── Helpers internos ──────────────────────────── */

  private buildUrl(
    path: string,
    query?: RequestOptions<unknown>['query'],
  ): string {
    const base = this.config.baseUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    // O apiPrefix é o que está configurado (default '/api/v1'). Se o caller
    // passou um path que já começa com o prefixo, não o duplicamos.
    const prefix = this.config.apiPrefix;
    const fullPath = cleanPath.startsWith(prefix + '/') || cleanPath === prefix
      ? cleanPath
      : `${prefix}${cleanPath}`;
    const url = new URL(`${base}${fullPath}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private ensureCsrf(): Promise<void> {
    if (!this.csrfPromise) {
      this.csrfPromise = this.request<void>('/v1/auth/csrf-cookie', {
        method: 'GET',
        noTenantHeader: true,
        noCsrf: true,
        maxRetries: 0,
      }).then(
        () => undefined,
        () => undefined, // CSRF é best-effort; falhar não bloqueia
      );
    }
    return this.csrfPromise;
  }

  /** Limpa a cache de CSRF (chamar após logout). */
  resetCsrf(): void {
    this.csrfPromise = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

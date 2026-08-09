/**
 * Erros tipados do `api-client`.
 *
 * Estes erros são **a única coisa que se pode esperar** das funções do cliente.
 * O resto do código vê o tipo `Result<T>` (ver `client.ts`).
 */

/** Erro de validação — o servidor respondeu, mas a forma dos dados não bate com o schema wire. */
export class ValidationError extends Error {
  /** Schema Zod que falhou (string legível). */
  public readonly schema: string;
  /** Mensagens Zod detalhadas. */
  public readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(
    schema: string,
    issues: ReadonlyArray<{ path: string; message: string }>,
    message?: string,
  ) {
    super(message ?? `Resposta inválida (${schema}): ${issues.length} issue(s)`);
    this.name = 'ValidationError';
    this.schema = schema;
    this.issues = issues;
  }
}

/** Erro HTTP do servidor (4xx/5xx com payload). */
export class ApiError extends Error {
  public readonly status: number;
  public readonly url: string;
  public readonly method: string;
  public readonly body: unknown;

  constructor(
    status: number,
    url: string,
    method: string,
    body: unknown,
    message?: string,
  ) {
    super(
      message ??
        `API ${method} ${url} → HTTP ${status}${
          body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? `: ${body.message}`
            : ''
        }`,
    );
    this.name = 'ApiError';
    this.status = status;
    this.url = url;
    this.method = method;
    this.body = body;
  }
}

/** Erro de rede (sem resposta do servidor, timeout, abort, etc.). */
export class NetworkError extends Error {
  public readonly cause: unknown;

  constructor(cause: unknown, message?: string) {
    super(message ?? (cause instanceof Error ? cause.message : 'Falha de rede'));
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

/** Erro quando a resposta é sucesso (2xx) mas o body não é JSON válido. */
export class InvalidJsonError extends Error {
  constructor(message: string = 'Resposta não é JSON válido') {
    super(message);
    this.name = 'InvalidJsonError';
  }
}

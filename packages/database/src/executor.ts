/**
 * Tipo partilhado pelos repositórios e pelos pontos de chamada para aceitar
 * um `pg.Pool` (modo de alta-level, usado em suites e em transacções curtas)
 * ou um `pg.PoolClient` (modo transaccional, obtido via `pool.connect()`).
 *
 * Os repos só executam uma única `query()` e devolvem; ambos os tipos a
 * suportam, mas `Pool` expõe mais estado do que `PoolClient`, daí a
 * intersecção explícita.
 */
export type QueryExecutor = import('pg').Pool | import('pg').PoolClient;

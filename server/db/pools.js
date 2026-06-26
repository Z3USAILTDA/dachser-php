/**
 * server/db/pools.js
 * Pool registry centralizado — um pool por fase (lazy init).
 * Importado por todos os arquivos de rotas.
 */
import mysql from 'mysql2/promise';

const _pools = {};

/**
 * Retorna (criando se necessário) um pool de conexão para a fase especificada.
 * @param {'air'|'auth'|'sea'|'fin'|'draft'|'admin'|'ops'|'olimpo'} phase
 */
export function getPoolFor(phase) {
  if (_pools[phase]) return _pools[phase];

  const prefix = `MARIADB_${phase.toUpperCase()}`;
  const e = process.env;

  const host     = e[`${prefix}_HOST`]     || e.DB_HOST;
  const port     = parseInt(e[`${prefix}_PORT`]     || e.DB_PORT     || '3306');
  const database = e[`${prefix}_DATABASE`] || e.DB_NAME;
  const user     = e[`${prefix}_USER`]     || e.DB_USER     || undefined;
  const password = e[`${prefix}_PASSWORD`] || e.DB_PASSWORD || undefined;

  if (!host || !database) {
    throw new Error(
      `[pool:${phase}] Variáveis de ambiente incompletas. ` +
      `Defina ${prefix}_HOST e ${prefix}_DATABASE no .env`
    );
  }

  const pool = mysql.createPool({
    host, port, database, user, password,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 8000,
  });

  pool.pool.on('connection', (conn) => {
    conn.promise().query('SET GLOBAL max_allowed_packet = 1073741824').catch(() => {});
  });

  _pools[phase] = pool;
  return _pools[phase];
}

/** Atalhos semânticos */
export const getPool     = () => getPoolFor('air');   // legado — air tracking
export const getAuthPool = () => getPoolFor('auth');
export const getFinPool  = () => getPoolFor('fin');
export const getSeaPool  = () => getPoolFor('sea');

/**
 * Executa uma query com retry automático.
 * Retorna rows diretamente (sem o meta de affectedRows).
 */
export async function queryWithRetry(sql, params = [], maxRetries = 1, phase = 'air') {
  const db = getPoolFor(phase);
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const [rows] = await db.query(sql, params);
      return rows;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

/**
 * Retorna todos os pools criados — usado para healthcheck na inicialização.
 */
export function getAllPools() {
  return _pools;
}

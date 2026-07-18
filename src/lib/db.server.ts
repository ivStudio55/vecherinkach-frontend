import { Pool } from 'pg';

let _pool: Pool | null = null;

function getConnectionString(): string | undefined {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return connectionString;
  const url = new URL(connectionString);
  url.searchParams.delete('sslmode');
  url.searchParams.delete('sslcert');
  url.searchParams.delete('sslkey');
  url.searchParams.delete('sslrootcert');
  return url.toString();
}

export function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: getConnectionString(),
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
    });
  }
  return _pool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const { rows } = await getPool().query(sql, params);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function queryCount(sql: string, params?: unknown[]): Promise<number> {
  const result = await getPool().query(sql, params);
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function execute(sql: string, params?: unknown[]): Promise<number> {
  const result = await getPool().query(sql, params);
  return result.rowCount ?? 0;
}

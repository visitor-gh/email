import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return pool;
}

function convertToNumberedParams(sql: string, startIndex = 1): { sql: string; nextIndex: number } {
  let index = startIndex;
  const converted = sql.replace(/\?/g, () => `$${index++}`);
  return { sql: converted, nextIndex: index };
}

export { convertToNumberedParams };

export function getDb() {
  return {
    async get<T>(sql: string, params?: unknown[]): Promise<T | undefined> {
      const { sql: converted } = convertToNumberedParams(sql);
      const result = await getPool().query(converted, params);
      return result.rows[0] as T | undefined;
    },

    async all<T>(sql: string, params?: unknown[]): Promise<T[]> {
      const { sql: converted } = convertToNumberedParams(sql);
      const result = await getPool().query(converted, params);
      return result.rows as T[];
    },

    async run(sql: string, params?: unknown[]): Promise<{ changes: number }> {
      const { sql: converted } = convertToNumberedParams(sql);
      const result = await getPool().query(converted, params);
      return { changes: result.rowCount ?? 0 };
    },

    async exec(sql: string): Promise<void> {
      await getPool().query(sql);
    },

    async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
      const client = await getPool().connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch { /* ignore */ }
        throw e;
      } finally {
        client.release();
      }
    },
  };
}

export async function initializeDb(): Promise<void> {
  // Initialize pool (it will connect lazily)
  getPool();
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export default getDb;

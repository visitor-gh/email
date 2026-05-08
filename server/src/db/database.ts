import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const DB_PATH = path.resolve(process.env.DB_PATH || './data/email.db');
const dbDir = path.dirname(DB_PATH);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

type SqlJsRow = Record<string, string | number | null>;

type PrepareResult = {
  get(...args: unknown[]): unknown;
  all(...args: unknown[]): unknown[];
  run(...args: unknown[]): { changes: number };
};

class DbWrapper {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private db: any;
  private dbPath: string;
  private inTransaction = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: any, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  private save(): void {
    const data: Uint8Array = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  private static normalizeRow(row: SqlJsRow): SqlJsRow {
    for (const key of Object.keys(row)) {
      if (typeof row[key] === 'bigint') row[key] = Number(row[key] as unknown as bigint);
    }
    return row;
  }

  exec(sql: string): void {
    this.db.exec(sql);
    if (!this.inTransaction) this.save();
  }

  prepare(sql: string): PrepareResult {
    const self = this;
    return {
      get(...args: unknown[]) {
        const stmt = self.db.prepare(sql);
        if (args.length > 0) stmt.bind(args);
        let result: unknown;
        if (stmt.step()) result = DbWrapper.normalizeRow(stmt.getAsObject());
        stmt.free();
        return result;
      },
      all(...args: unknown[]) {
        const stmt = self.db.prepare(sql);
        if (args.length > 0) stmt.bind(args);
        const rows: unknown[] = [];
        while (stmt.step()) rows.push(DbWrapper.normalizeRow(stmt.getAsObject()));
        stmt.free();
        return rows;
      },
      run(...args: unknown[]) {
        self.db.run(sql, args.length > 0 ? args : undefined);
        const changes: number = self.db.getRowsModified();
        if (!self.inTransaction) self.save();
        return { changes };
      },
    };
  }

  transaction<T>(fn: (arg: T) => void): (arg: T) => void {
    return (arg: T) => {
      this.inTransaction = true;
      this.db.run('BEGIN TRANSACTION');
      try {
        fn(arg);
        this.db.run('COMMIT');
      } catch (e) {
        try { this.db.run('ROLLBACK'); } catch { /* ignore */ }
        throw e;
      } finally {
        this.inTransaction = false;
        this.save();
      }
    };
  }

  close(): void {
    this.db.close();
  }
}

let dbInstance: DbWrapper | null = null;

export async function initializeDb(): Promise<void> {
  if (dbInstance) return;

  const sqlJsPkg = require.resolve('sql.js/package.json');
  const sqlJsRoot = path.dirname(sqlJsPkg);
  const wasmBinary = fs.readFileSync(path.join(sqlJsRoot, 'dist', 'sql-wasm.wasm'));

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({ wasmBinary });

  let database: unknown;
  if (fs.existsSync(DB_PATH)) {
    database = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    database = new SQL.Database();
  }

  dbInstance = new DbWrapper(database, DB_PATH);
}

export function getDb(): DbWrapper {
  if (!dbInstance) throw new Error('DB가 초기화되지 않았습니다. initializeDb()를 먼저 호출하세요.');
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export default getDb;

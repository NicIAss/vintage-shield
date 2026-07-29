export type DatabaseResult<T = Record<string, unknown>> = {
  results?: T[];
  success?: boolean;
  meta?: Record<string, unknown>;
};

export interface DatabaseStatement {
  bind(...values: unknown[]): DatabaseStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
  run(): Promise<DatabaseResult>;
}

export interface Database {
  prepare(query: string): DatabaseStatement;
  batch(statements: DatabaseStatement[]): Promise<unknown[]>;
}

type QueryResult = {
  rows: Record<string, unknown>[];
  rowCount: number | null;
};

type QueryClient = {
  query(sql: string, values?: unknown[]): Promise<QueryResult>;
  release?: () => void;
};

type PoolLike = QueryClient & {
  connect(): Promise<QueryClient>;
};

function postgresSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

class PostgresStatement implements DatabaseStatement {
  constructor(
    private readonly database: PostgresDatabase,
    readonly sql: string,
    readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new PostgresStatement(this.database, this.sql, values);
  }

  async execute(client?: QueryClient) {
    return (client ?? this.database.pool).query(
      postgresSql(this.sql),
      this.values,
    );
  }

  async first<T>() {
    const result = await this.execute();
    return (result.rows[0] as T | undefined) ?? null;
  }

  async all<T>() {
    const result = await this.execute();
    return {
      results: result.rows as T[],
      success: true,
      meta: { changes: result.rowCount ?? 0 },
    };
  }

  async run() {
    const result = await this.execute();
    return {
      success: true,
      meta: { changes: result.rowCount ?? 0 },
    };
  }
}

class PostgresDatabase implements Database {
  constructor(readonly pool: PoolLike) {}

  prepare(query: string) {
    return new PostgresStatement(this, query);
  }

  async batch(statements: DatabaseStatement[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const results: unknown[] = [];
      for (const statement of statements) {
        if (!(statement instanceof PostgresStatement)) {
          throw new Error("Cannot mix database statement types");
        }
        results.push(await statement.execute(client));
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release?.();
    }
  }
}

let postgresPromise: Promise<Database> | null = null;

export function postgresDatabase(databaseUrl: string) {
  postgresPromise ??= (async () => {
    const packageName = "pg";
    const postgres = (await import(/* webpackIgnore: true */ packageName)) as {
      Pool: new (options: {
        connectionString: string;
        max: number;
        idleTimeoutMillis: number;
      }) => PoolLike;
    };
    const pool = new postgres.Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
    });
    return new PostgresDatabase(pool);
  })();
  return postgresPromise;
}

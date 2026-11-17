import type { DatabaseSync, SQLInputValue } from "node:sqlite";

/**
 * A D1 database backed by an in-memory SQLite database.
 *
 * The Effect D1 driver takes a `D1Database`; these tests run its compiled SQL
 * against `node:sqlite` so the statements are the ones D1 would receive. Only
 * `prepare().bind().all()` is implemented, because that is the path the driver
 * uses; anything else fails loudly rather than pretending to work.
 */
export interface SqliteD1Options {
  readonly maxBindings?: number;
  readonly onBind?: (count: number) => void;
}

class SqliteD1Statement implements D1PreparedStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly query: string,
    private readonly values: readonly unknown[],
    private readonly options: SqliteD1Options,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new SqliteD1Statement(
      this.database,
      this.query,
      values,
      this.options,
    );
  }

  async all<T = unknown>(): Promise<D1Result<T>> {
    const limit = this.options.maxBindings;

    this.options.onBind?.(this.values.length);

    if (limit !== undefined && this.values.length > limit) {
      throw new Error("D1 binding limit exceeded");
    }

    // SAFETY: bound parameters are SQLite scalar values by construction, and
    // the driver's generic is the caller's row contract for the returned rows.
    const results = this.database
      .prepare(this.query)
      .all(...(this.values as SQLInputValue[])) as T[];

    return {
      success: true,
      results,
      meta: {
        duration: 0,
        size_after: 0,
        rows_read: results.length,
        rows_written: 0,
        last_row_id: 0,
        changed_db: false,
        changes: 0,
      },
    };
  }

  first(): Promise<never> {
    return Promise.reject(new Error("first is not used by the test driver"));
  }

  run(): Promise<never> {
    return Promise.reject(new Error("run is not used by the test driver"));
  }

  raw(): Promise<never> {
    return Promise.reject(new Error("raw is not used by the test driver"));
  }
}

/** A `D1Database` implementation over `node:sqlite`, for driver tests. */
export class SqliteD1 implements D1Database {
  constructor(
    private readonly database: DatabaseSync,
    private readonly options: SqliteD1Options = {},
  ) {}

  prepare(query: string): D1PreparedStatement {
    return new SqliteD1Statement(this.database, query, [], this.options);
  }

  batch(): Promise<never> {
    return Promise.reject(new Error("batch is not used by the test driver"));
  }

  exec(): Promise<never> {
    return Promise.reject(new Error("exec is not used by the test driver"));
  }

  withSession(): never {
    throw new Error("withSession is not used by the test driver");
  }

  dump(): Promise<never> {
    return Promise.reject(new Error("dump is not used by the test driver"));
  }
}

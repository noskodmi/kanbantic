/**
 * Helpers for building parameterized SQL `WHERE` clauses from
 * `URLSearchParams`. The contract is paranoid: callers pass the column
 * name and the user-supplied value; we never concatenate the value into
 * the SQL string. The column name is the developer's responsibility — we
 * still check it against `/^[a-zA-Z_][a-zA-Z0-9_.]*$/` to defend against
 * a future caller forgetting which side of the boundary they're on.
 */

const COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

export class WhereBuilder {
  private readonly clauses: string[] = [];
  private readonly bindings: unknown[] = [];

  /** Add `<column> = ?` if `value` is a non-empty string. */
  eq(column: string, value: string | null | undefined): this {
    if (value === null || value === undefined || value.length === 0) return this;
    assertColumn(column);
    this.clauses.push(`${column} = ?`);
    this.bindings.push(value);
    return this;
  }

  /** Add `LOWER(<column>) = LOWER(?)` if value is non-empty. */
  eqLower(column: string, value: string | null | undefined): this {
    if (value === null || value === undefined || value.length === 0) return this;
    assertColumn(column);
    this.clauses.push(`LOWER(${column}) = LOWER(?)`);
    this.bindings.push(value);
    return this;
  }

  /** Add `LOWER(<column>) LIKE LOWER('%' || ? || '%')` if value is non-empty. */
  likeContainsCi(column: string, value: string | null | undefined): this {
    if (value === null || value === undefined || value.length === 0) return this;
    assertColumn(column);
    this.clauses.push(`LOWER(${column}) LIKE LOWER('%' || ? || '%')`);
    this.bindings.push(value);
    return this;
  }

  /** Add `<column> >= ?` if value is non-empty (parses as number). */
  gteNumber(column: string, value: string | null | undefined): this {
    if (value === null || value === undefined || value.length === 0) return this;
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n)) return this;
    assertColumn(column);
    this.clauses.push(`${column} >= ?`);
    this.bindings.push(n);
    return this;
  }

  /**
   * Like `gteNumber`, but the left-hand side is a fixed SQL expression
   * (e.g. `COALESCE(r.score, 0)`) the developer constructed at the call
   * site. Column-safety check is skipped because the expression isn't a
   * single identifier — callers must NOT pass any user input here.
   */
  gteNumberExpr(expr: string, value: string | null | undefined): this {
    if (value === null || value === undefined || value.length === 0) return this;
    const n = Number.parseFloat(value);
    if (!Number.isFinite(n)) return this;
    this.clauses.push(`${expr} >= ?`);
    this.bindings.push(n);
    return this;
  }

  /** Add a raw clause + bindings. The clause must already be parameterized. */
  raw(clause: string, ...bindings: unknown[]): this {
    this.clauses.push(clause);
    for (const b of bindings) this.bindings.push(b);
    return this;
  }

  /** Returns `WHERE x AND y` or empty string when no clauses present. */
  whereSql(): string {
    return this.clauses.length === 0 ? "" : ` WHERE ${this.clauses.join(" AND ")}`;
  }

  binds(): unknown[] {
    return this.bindings.slice();
  }
}

function assertColumn(column: string): void {
  if (!COLUMN_RE.test(column)) {
    throw new Error(`unsafe column reference: ${column}`);
  }
}

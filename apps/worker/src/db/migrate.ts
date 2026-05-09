import migration0001 from "../../migrations/0001_initial.sql";

const MIGRATIONS = [{ filename: "0001_initial.sql", sql: migration0001 }] as const;

/**
 * Apply all pending migrations idempotently. Tracks applied filenames in
 * the `_migrations` table.
 *
 * Crash-mid-migration is safe because every CREATE in the schema uses
 * `IF NOT EXISTS`. The filename is recorded only after all statements
 * succeed, so a partial run replays cleanly on the next call.
 */
export async function applyMigrations(db: D1Database): Promise<void> {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`,
    )
    .run();

  const applied = await db.prepare("SELECT filename FROM _migrations").all<{ filename: string }>();
  const seen = new Set(applied.results.map((r) => r.filename));

  for (const mig of MIGRATIONS) {
    if (seen.has(mig.filename)) continue;
    // Strip `-- …` line comments before splitting. The schema has no `;`
    // inside string literals, so a simple split on `;` is safe. We run
    // each statement via prepare().run() because D1's exec() requires
    // each statement to fit on a single line.
    const stripped = mig.sql
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");
    const statements = stripped
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await db.prepare(stmt).run();
    }
    await db.prepare("INSERT INTO _migrations (filename) VALUES (?)").bind(mig.filename).run();
  }
}

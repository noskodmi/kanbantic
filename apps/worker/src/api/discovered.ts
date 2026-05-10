/**
 * `GET /api/discovered` — paginated list of repos surfaced by the
 * Apify discoverer Actor (see `apify/`).
 *
 * Paging shape mirrors `/api/agents` — same `limit` clamp + cache.
 */

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function discoveredHandler(request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));

  const result = await env.DB.prepare(
    `SELECT repo_url, mcp_path, suggested_label, status, claimed_node, discovered_at
       FROM discovered_agents_apify
       ORDER BY discovered_at DESC
       LIMIT ?`,
  )
    .bind(limit)
    .all();

  return Response.json(
    { discovered: result.results, limit },
    {
      headers: {
        "cache-control": "public, max-age=10, stale-while-revalidate=60",
      },
    },
  );
}

function clampLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

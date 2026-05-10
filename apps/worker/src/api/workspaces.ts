/**
 * GET /api/workspaces
 *
 * Lists every indexed `WorkspaceCreated` event from D1 (newest first).
 *
 * Why a worker endpoint instead of `getLogs` from the browser: a
 * full-history `getLogs` over the entire chain is the only thing
 * Alchemy's free tier refuses outright (10-block range cap).
 * PublicNode permits it but our deployer's account is on Alchemy
 * for everything else, so we centralise the historical scan in the
 * worker indexer (which already runs `eth_getLogs` chunked + paged
 * via the indexer cursor) and serve the result from D1.
 */

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;

interface WorkspaceRow {
  node: string;
  parent: string;
  admin: string;
  created_at_block: number;
  created_at_ts: number;
}

export async function workspacesListHandler(request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const parsed = Number.parseInt(limitRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) limit = Math.min(parsed, MAX_LIMIT);
  }

  const result = await env.DB.prepare(
    `SELECT node, parent, admin, created_at_block, created_at_ts
       FROM workspaces
      ORDER BY created_at_block DESC
      LIMIT ?`,
  )
    .bind(limit)
    .all<WorkspaceRow>();

  return Response.json(
    { workspaces: result.results, limit },
    {
      headers: { "cache-control": "public, max-age=10, stale-while-revalidate=60" },
    },
  );
}

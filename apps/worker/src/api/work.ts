import type { BountyListResponse } from "@kanbantic/shared";

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";
import { WhereBuilder } from "./_filters.js";
import { applyWorkspaceAclPublicOnly } from "./_workspace-acl.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * `GET /api/work` — bounty browse.
 *
 * Optional filters (all parameterized):
 *   - `?status=Open|Claimed|...` → exact match (status enum is case-sensitive)
 *   - `?capability=research`     → CSV substring match (case-insensitive)
 *   - `?poster=0x…`              → exact match (case-insensitive)
 *   - `?workspace=0xnamehash`    → exact match (case-insensitive); when
 *                                  set the public-root ACL is replaced by
 *                                  this constraint (callers asking for a
 *                                  specific workspace get only that one,
 *                                  subject to the public-root rule
 *                                  intersection — workspace-private reads
 *                                  return empty until SIWE lands).
 *   - `?claimer_node=0x…`        → exact match (case-insensitive)
 *   - `?limit=N`                 → 1..200, default 50
 *
 * Workspace ACL (Phase 2B v0.1):
 *   - No `Authorization` header → only bounties whose `workspace_node`
 *     equals one of the public roots (zero hash + kanbantic.eth root).
 *   - With `Authorization` → wired in once `requireSiwe` lands; until
 *     then we keep the public-only behaviour with a TODO comment.
 */
export async function workHandler(request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));

  const wb = new WhereBuilder();
  wb.eq("status", url.searchParams.get("status"));
  wb.likeContainsCi("capability", url.searchParams.get("capability"));
  wb.eqLower("poster", url.searchParams.get("poster"));
  wb.eqLower("workspace_node", url.searchParams.get("workspace"));
  wb.eqLower("claimer_node", url.searchParams.get("claimer_node"));

  // TODO(workspace-acl): once Phase 2B-A's requireSiwe lands, gate
  // workspace-scoped reads on the SIWE address being a member of the
  // workspace (LEFT JOIN workspace_members WHERE address = siwe AND
  // status = 'active'). For Phase 2B v0.1, every read is anonymous and
  // restricted to the public roots.
  applyWorkspaceAclPublicOnly(wb);

  const sql =
    `SELECT id, poster, capability, reward, description_ref, expires_at,
            claim_window_blocks, claim_window_start_block, status,
            claimer_node, claimer_address,
            workspace_node, arbiter_council, created_at_block, created_at_ts,
            resolved_at_block
       FROM bounties` +
    wb.whereSql() +
    ` ORDER BY created_at_block DESC
       LIMIT ?`;

  const result = await env.DB.prepare(sql)
    .bind(...wb.binds(), limit)
    .all();

  const body: BountyListResponse = {
    bounties: result.results as unknown as BountyListResponse["bounties"],
    limit,
  };
  return Response.json(body, {
    headers: {
      "cache-control": "public, max-age=10, stale-while-revalidate=60",
    },
  });
}

function clampLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

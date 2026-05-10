import type { BountyListResponse } from "@kanbantic/shared";

import { optionalSiwe } from "../auth/siwe.js";
import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";
import { WhereBuilder } from "./_filters.js";
import { applyWorkspaceAcl } from "./_workspace-acl.js";

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

  // SIWE-aware workspace ACL: anonymous callers see only public roots;
  // authenticated callers also see workspaces they're an active member of.
  const session = await optionalSiwe(request, env);
  applyWorkspaceAcl(wb, session?.address);

  const sql =
    `SELECT b.id, b.poster, b.capability, b.reward, b.description_ref, b.expires_at,
            b.claim_window_blocks, b.claim_window_start_block, b.status,
            b.claimer_node, b.claimer_address, b.submission_ref,
            b.workspace_node, b.arbiter_council, b.created_at_block, b.created_at_ts,
            b.resolved_at_block,
            a.label AS claimer_label
       FROM bounties b
       LEFT JOIN agents a ON LOWER(a.node) = LOWER(b.claimer_node)` +
    wb.whereSql() +
    ` ORDER BY b.created_at_block DESC
       LIMIT ?`;

  const result = await env.DB.prepare(sql)
    .bind(...wb.binds(), limit)
    .all();

  const body: BountyListResponse = {
    bounties: result.results as unknown as BountyListResponse["bounties"],
    limit,
  };
  // Authenticated responses are workspace-scoped, so they must NOT be
  // shared via public caches.
  const cacheControl =
    session === null ? "public, max-age=10, stale-while-revalidate=60" : "private, no-cache";
  return Response.json(body, { headers: { "cache-control": cacheControl } });
}

function clampLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

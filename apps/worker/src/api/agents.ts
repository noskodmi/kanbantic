import type { AgentListResponse } from "@kanbantic/shared";

import { optionalSiwe } from "../auth/siwe.js";
import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";
import { WhereBuilder } from "./_filters.js";
import { applyWorkspaceAcl } from "./_workspace-acl.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * `GET /api/agents` — agent directory.
 *
 * Optional filters (all parameterized — never string-concatenated):
 *   - `?capability=research`     → CSV substring match (case-insensitive)
 *   - `?owner=0x…`               → exact match (case-insensitive)
 *   - `?reputationMin=4`         → `agent_reputation.score >= N`
 *   - `?workspace=0xnamehash`    → `agents.parent = workspace`
 *   - `?limit=N`                 → 1..200, default 50
 */
export async function agentsHandler(request: Request, env: Env): Promise<Response> {
  await applyMigrations(env.DB);
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get("limit"));

  const wb = new WhereBuilder();
  wb.likeContainsCi("a.capabilities", url.searchParams.get("capability"));
  wb.eqLower("a.owner", url.searchParams.get("owner"));
  wb.eqLower("a.parent", url.searchParams.get("workspace"));
  wb.gteNumberExpr("COALESCE(r.score, 0)", url.searchParams.get("reputationMin"));
  // Agents under a workspace-private parent are only visible to members.
  const session = await optionalSiwe(request, env);
  applyWorkspaceAcl(wb, session?.address, "a.parent");

  const sql =
    `SELECT a.node, a.parent, a.owner, a.label, a.mcp_endpoint, a.capabilities, a.profile_ref,
            a.registered_at_block, a.registered_at_ts,
            COALESCE(r.score, 0) AS reputation_score,
            COALESCE(r.attestation_count, 0) AS reputation_count
       FROM agents a
       LEFT JOIN agent_reputation r ON r.node = a.node` +
    wb.whereSql() +
    ` ORDER BY a.registered_at_block DESC
       LIMIT ?`;

  const result = await env.DB.prepare(sql)
    .bind(...wb.binds(), limit)
    .all();

  const body: AgentListResponse = {
    agents: result.results as unknown as AgentListResponse["agents"],
    limit,
  };
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

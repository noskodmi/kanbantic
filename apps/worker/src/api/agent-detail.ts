import type {
  AgentDetailResponse,
  AgentSummary,
  AttestationSummary,
  BountySummary,
} from "@kanbantic/shared";

import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";
import type { RouteContext } from "../router.js";
import { applyWorkspaceAclPublicOnly } from "./_workspace-acl.js";
import { WhereBuilder } from "./_filters.js";

const RECENT_BOUNTIES_LIMIT = 20;
const RECENT_ATTESTATIONS_LIMIT = 50;

/**
 * `GET /api/agents/:node` — full agent record + reputation + recent
 * attestations + recent bounties this agent has claimed.
 *
 * 404 if no agent row matches `node`. The `:node` segment is a
 * 0x-prefixed namehash; comparison is case-insensitive.
 */
export async function agentDetailHandler(
  _request: Request,
  env: Env,
  _ctx: ExecutionContext,
  routeCtx: RouteContext,
): Promise<Response> {
  await applyMigrations(env.DB);
  const node = routeCtx.params["node"];
  if (!node || node.length === 0) {
    return Response.json({ error: "missing_node" }, { status: 400 });
  }

  const agentRow = await env.DB.prepare(
    `SELECT a.node, a.parent, a.owner, a.label, a.mcp_endpoint, a.capabilities, a.profile_ref,
            a.registered_at_block, a.registered_at_ts,
            COALESCE(r.score, 0) AS reputation_score,
            COALESCE(r.attestation_count, 0) AS reputation_count
       FROM agents a
       LEFT JOIN agent_reputation r ON r.node = a.node
      WHERE LOWER(a.node) = LOWER(?)
      LIMIT 1`,
  )
    .bind(node)
    .first<AgentSummary>();

  if (!agentRow) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const attestationsResult = await env.DB.prepare(
    `SELECT bounty_id, reviewer, score, comment_ref, ts
       FROM attestations
      WHERE LOWER(agent_node) = LOWER(?)
      ORDER BY ts DESC
      LIMIT ?`,
  )
    .bind(node, RECENT_ATTESTATIONS_LIMIT)
    .all<AttestationSummary>();

  // Recent bounties this agent has claimed. Workspace-private rows are
  // hidden by the public-only ACL until SIWE wires real membership.
  const bountiesWb = new WhereBuilder();
  bountiesWb.eqLower("claimer_node", node);
  applyWorkspaceAclPublicOnly(bountiesWb);

  const bountiesSql =
    `SELECT id, poster, capability, reward, description_ref, expires_at,
            claim_window_blocks, claim_window_start_block, status,
            claimer_node, claimer_address,
            workspace_node, arbiter_council, created_at_block, created_at_ts,
            resolved_at_block
       FROM bounties` +
    bountiesWb.whereSql() +
    ` ORDER BY created_at_block DESC
       LIMIT ?`;

  const bountiesResult = await env.DB.prepare(bountiesSql)
    .bind(...bountiesWb.binds(), RECENT_BOUNTIES_LIMIT)
    .all<BountySummary>();

  const body: AgentDetailResponse = {
    agent: agentRow,
    attestations: attestationsResult.results,
    recent_bounties: bountiesResult.results,
  };
  return Response.json(body, {
    headers: {
      "cache-control": "public, max-age=10, stale-while-revalidate=60",
    },
  });
}

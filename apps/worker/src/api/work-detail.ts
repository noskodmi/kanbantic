import type {
  AgentSummary,
  AttestationSummary,
  BountyDetailResponse,
  BountyHistoryEntry,
  BountySummary,
} from "@kanbantic/shared";

import { optionalSiwe } from "../auth/siwe.js";
import { applyMigrations } from "../db/migrate.js";
import type { Env } from "../env.js";
import type { RouteContext } from "../router.js";
import { isPublicWorkspace, isWorkspaceMember } from "./_workspace-acl.js";

/**
 * `GET /api/work/:id` — bounty + status timeline + (optional) joined
 * claimer agent + attestations on this bounty.
 *
 * 404 when the bounty doesn't exist OR the bounty's `workspace_node`
 * isn't a public root (Phase 2B v0.1 has no SIWE wiring; private rows
 * 404 anonymously instead of 403 to avoid leaking existence).
 *
 * The `:id` segment is a positive decimal integer. Non-numeric or
 * non-positive ids return 400.
 */
export async function workDetailHandler(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  routeCtx: RouteContext,
): Promise<Response> {
  await applyMigrations(env.DB);
  const idRaw = routeCtx.params["id"];
  if (!idRaw || idRaw.length === 0) {
    return Response.json({ error: "missing_id" }, { status: 400 });
  }
  const id = Number.parseInt(idRaw, 10);
  if (!Number.isFinite(id) || id <= 0 || String(id) !== idRaw) {
    return Response.json({ error: "invalid_id" }, { status: 400 });
  }

  const bounty = await env.DB.prepare(
    `SELECT b.id, b.poster, b.capability, b.reward, b.description_ref, b.expires_at,
            b.claim_window_blocks, b.claim_window_start_block, b.status,
            b.claimer_node, b.claimer_address, b.submission_ref,
            b.workspace_node, b.arbiter_council, b.created_at_block, b.created_at_ts,
            b.resolved_at_block,
            a.label AS claimer_label
       FROM bounties b
       LEFT JOIN agents a ON LOWER(a.node) = LOWER(b.claimer_node)
      WHERE b.id = ?
      LIMIT 1`,
  )
    .bind(id)
    .first<BountySummary>();

  if (!bounty) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // SIWE-aware workspace ACL: workspace-private bounties 404 anonymously,
  // but if the caller has a valid SIWE session AND is an active member of
  // the bounty's workspace, they get to read the row.
  let isAuthenticated = false;
  if (!isPublicWorkspace(bounty.workspace_node)) {
    const session = await optionalSiwe(request, env);
    if (
      session === null ||
      !(await isWorkspaceMember(env.DB, bounty.workspace_node, session.address))
    ) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    isAuthenticated = true;
  }

  const historyResult = await env.DB.prepare(
    `SELECT status_from, status_to, tx_hash, block_number, ts
       FROM bounty_history
      WHERE bounty_id = ?
      ORDER BY block_number ASC, log_index ASC`,
  )
    .bind(id)
    .all<BountyHistoryEntry>();

  const attestationsResult = await env.DB.prepare(
    `SELECT bounty_id, reviewer, score, comment_ref, ts
       FROM attestations
      WHERE bounty_id = ?
      ORDER BY ts DESC`,
  )
    .bind(id)
    .all<AttestationSummary>();

  let claimerAgent: AgentSummary | null = null;
  if (bounty.claimer_node !== null && bounty.claimer_node.length > 0) {
    const row = await env.DB.prepare(
      `SELECT a.node, a.parent, a.owner, a.label, a.mcp_endpoint, a.capabilities, a.profile_ref,
              a.registered_at_block, a.registered_at_ts,
              COALESCE(r.score, 0) AS reputation_score,
              COALESCE(r.attestation_count, 0) AS reputation_count
         FROM agents a
         LEFT JOIN agent_reputation r ON r.node = a.node
        WHERE LOWER(a.node) = LOWER(?)
        LIMIT 1`,
    )
      .bind(bounty.claimer_node)
      .first<AgentSummary>();
    claimerAgent = row ?? null;
  }

  const body: BountyDetailResponse = {
    bounty,
    history: historyResult.results,
    claimer_agent: claimerAgent,
    attestations: attestationsResult.results,
  };
  const cacheControl = isAuthenticated
    ? "private, no-cache"
    : "public, max-age=10, stale-while-revalidate=60";
  return Response.json(body, { headers: { "cache-control": cacheControl } });
}

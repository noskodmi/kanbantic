/**
 * Workspace ACL helpers for read-side endpoints.
 *
 * The on-chain model is: a bounty is "public" when its `workspace_node`
 * equals either the zero hash (no workspace) or the kanbantic.eth root
 * namehash. Anything else is workspace-scoped — only members of that
 * workspace (`workspace_members.address = caller AND status = 'active'`)
 * may read it.
 *
 * Phase 2B v0.1 implements the unauthenticated branch (public-only).
 * The SIWE branch is wired with a TODO comment until Phase 2B-A's
 * `requireSiwe` import path lands on main.
 */

import { sepoliaDeployment } from "@kanbantic/shared";

import type { WhereBuilder } from "./_filters.js";

export const ZERO_NAMEHASH =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Public root namehashes — bounties scoped to one of these can be read
 * without auth. Lowercased for case-insensitive comparison against D1
 * column values.
 */
export const PUBLIC_ROOT_NAMEHASHES: readonly string[] = [
  ZERO_NAMEHASH.toLowerCase(),
  sepoliaDeployment.ens.rootNamehash.toLowerCase(),
];

/**
 * Append a public-only workspace ACL filter to `wb` (in-place). After
 * this call, the WHERE clause restricts results to bounties whose
 * `workspace_node` is one of the public roots. Use this when the
 * caller is unauthenticated.
 */
export function applyWorkspaceAclPublicOnly(wb: WhereBuilder, column = "workspace_node"): void {
  const placeholders = PUBLIC_ROOT_NAMEHASHES.map(() => "?").join(", ");
  wb.raw(`LOWER(${column}) IN (${placeholders})`, ...PUBLIC_ROOT_NAMEHASHES);
}

/**
 * Append the SIWE-aware workspace ACL filter: union of public roots and
 * any workspace the caller is an active member of. Use this when the
 * request carries a verified SIWE token; falls back to public-only if
 * `callerAddress` is null/undefined.
 */
export function applyWorkspaceAcl(
  wb: WhereBuilder,
  callerAddress: string | null | undefined,
  column = "workspace_node",
): void {
  if (callerAddress === null || callerAddress === undefined || callerAddress.length === 0) {
    applyWorkspaceAclPublicOnly(wb, column);
    return;
  }
  const placeholders = PUBLIC_ROOT_NAMEHASHES.map(() => "?").join(", ");
  wb.raw(
    `(LOWER(${column}) IN (${placeholders})` +
      ` OR LOWER(${column}) IN (SELECT LOWER(ws_node) FROM workspace_members WHERE LOWER(address) = LOWER(?) AND status = 'active'))`,
    ...PUBLIC_ROOT_NAMEHASHES,
    callerAddress.toLowerCase(),
  );
}

/**
 * True if a single bounty's `workspace_node` is publicly readable
 * without auth.
 */
export function isPublicWorkspace(workspaceNode: string | null | undefined): boolean {
  if (workspaceNode === null || workspaceNode === undefined) return true;
  return PUBLIC_ROOT_NAMEHASHES.includes(workspaceNode.toLowerCase());
}

/**
 * True if `callerAddress` is an active member of `workspaceNode`. Use
 * for per-bounty detail endpoints when the bounty is not publicly
 * readable. `db` is `env.DB`.
 */
export async function isWorkspaceMember(
  db: D1Database,
  workspaceNode: string,
  callerAddress: string | null | undefined,
): Promise<boolean> {
  if (callerAddress === null || callerAddress === undefined || callerAddress.length === 0) {
    return false;
  }
  const row = await db
    .prepare(
      "SELECT 1 AS one FROM workspace_members WHERE LOWER(ws_node) = LOWER(?) AND LOWER(address) = LOWER(?) AND status = 'active' LIMIT 1",
    )
    .bind(workspaceNode, callerAddress)
    .first<{ one: number }>();
  return row !== null;
}

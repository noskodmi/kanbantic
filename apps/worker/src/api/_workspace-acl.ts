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
 * `workspace_node` is one of the public roots.
 *
 * TODO(workspace-acl): once Phase 2B-A's requireSiwe lands, gate
 * workspace-scoped reads on the SIWE address being a member —
 * augment this with `OR workspace_node IN (SELECT ws_node FROM
 * workspace_members WHERE LOWER(address) = LOWER(?) AND status = 'active')`.
 */
export function applyWorkspaceAclPublicOnly(wb: WhereBuilder, column = "workspace_node"): void {
  const placeholders = PUBLIC_ROOT_NAMEHASHES.map(() => "?").join(", ");
  wb.raw(`LOWER(${column}) IN (${placeholders})`, ...PUBLIC_ROOT_NAMEHASHES);
}

/**
 * True if a single bounty's `workspace_node` is publicly readable
 * without auth. Used by the per-bounty detail endpoint.
 */
export function isPublicWorkspace(workspaceNode: string | null | undefined): boolean {
  if (workspaceNode === null || workspaceNode === undefined) return true;
  return PUBLIC_ROOT_NAMEHASHES.includes(workspaceNode.toLowerCase());
}

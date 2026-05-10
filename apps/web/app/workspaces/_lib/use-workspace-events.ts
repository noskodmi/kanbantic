"use client";

/**
 * React-Query backed hooks for workspace data.
 *
 *   useWorkspaceList()                 → indexed `WorkspaceCreated` rows
 *                                        from the worker (`/api/workspaces`).
 *                                        We can't `getLogs` from genesis
 *                                        in the browser anymore — Alchemy
 *                                        free tier rejects ranges > 10 blocks.
 *   useWorkspaceMembers(wsNode)        → `membersOf(wsNode)` view call.
 *                                        Also returns the admin (creator),
 *                                        unlike the historical event replay
 *                                        which dropped them silently.
 *   useWorkspaceAdmin(wsNode)          → `adminOf(wsNode)` view.
 *   useWorkspaceExists(wsNode)         → `exists(wsNode)` view.
 *
 * All four poll every 15s by default. Callers can manually invalidate
 * via the `queryClient` when a write transaction confirms.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { sepoliaDeployment, WorkspaceRegistryAbi } from "@kanbantic/shared";
import type { Address, Hex } from "viem";
import { usePublicClient } from "wagmi";

import { API_BASE } from "../../_lib/api.js";
import { buildLabelMap } from "./label-cache.js";
import type { WorkspaceMemberSet, WorkspaceRow } from "./types.js";

const WORKSPACE_REGISTRY_ADDRESS = sepoliaDeployment.contracts.WorkspaceRegistry;

/** Cached for 15s; refetched on window focus (default). */
const STALE_MS = 15_000;

interface WorkspaceApiRow {
  node: string;
  parent: string;
  admin: string;
  created_at_block: number;
  created_at_ts: number;
}

interface WorkspaceListResponse {
  workspaces: WorkspaceApiRow[];
  limit: number;
}

export function useWorkspaceList(): UseQueryResult<readonly WorkspaceRow[]> {
  return useQuery<readonly WorkspaceRow[]>({
    queryKey: ["workspaces", "list"],
    queryFn: async (): Promise<readonly WorkspaceRow[]> => {
      const res = await fetch(`${API_BASE}/api/workspaces?limit=200`, {
        headers: { accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`/api/workspaces → ${String(res.status)}`);
      }
      const body = (await res.json()) as WorkspaceListResponse;

      const rows: WorkspaceRow[] = body.workspaces.map((row) => ({
        node: row.node as Hex,
        label: null,
        admin: row.admin as Address,
        createdAtBlock: BigInt(row.created_at_block),
        createdTxHash: "0x", // tx hash not currently surfaced by the indexer
      }));

      const labels = buildLabelMap(rows.map((r) => r.node));
      return rows.map((row) => ({
        ...row,
        label: labels[row.node.toLowerCase()] ?? null,
      }));
    },
    staleTime: STALE_MS,
    refetchInterval: STALE_MS,
  });
}

/**
 * Reads the active member set via the on-chain `membersOf(wsNode)` view.
 *
 * Why a view call rather than walking `MemberAdded`/`MemberRemoved`
 * events: the contract creates the workspace creator as a member but
 * does NOT emit `MemberAdded` for that initial assignment. Replaying
 * events would silently drop the admin, leaving "0 members" on a
 * freshly-created workspace. `membersOf` filters its returned array
 * by the live `_isMember` map, so it gives us the source of truth
 * including the admin and excluding any removed addresses.
 */
export function useWorkspaceMembers(wsNode: Hex | null): UseQueryResult<WorkspaceMemberSet> {
  const publicClient = usePublicClient();

  return useQuery<WorkspaceMemberSet>({
    queryKey: ["workspaces", "members", wsNode ?? "none"],
    enabled: wsNode !== null,
    queryFn: async (): Promise<WorkspaceMemberSet> => {
      if (publicClient === undefined || wsNode === null) return { members: [] };

      const members = await publicClient.readContract({
        address: WORKSPACE_REGISTRY_ADDRESS,
        abi: WorkspaceRegistryAbi,
        functionName: "membersOf",
        args: [wsNode],
      });

      return { members: [...members] };
    },
    staleTime: STALE_MS,
    refetchInterval: STALE_MS,
  });
}

/**
 * Reads the current admin via `adminOf(wsNode)`. Cheaper than
 * replaying every `AdminTransferred` event and the source of truth.
 */
export function useWorkspaceAdmin(wsNode: Hex | null): UseQueryResult<Address | null> {
  const publicClient = usePublicClient();

  return useQuery<Address | null>({
    queryKey: ["workspaces", "admin", wsNode ?? "none"],
    enabled: wsNode !== null,
    queryFn: async (): Promise<Address | null> => {
      if (publicClient === undefined || wsNode === null) return null;
      const result = await publicClient.readContract({
        address: WORKSPACE_REGISTRY_ADDRESS,
        abi: WorkspaceRegistryAbi,
        functionName: "adminOf",
        args: [wsNode],
      });
      return result;
    },
    staleTime: STALE_MS,
    refetchInterval: STALE_MS,
  });
}

/**
 * Reads `exists(wsNode)`. Used by the detail page to distinguish
 * "doesn't exist" from "exists but no MemberAdded events yet".
 */
export function useWorkspaceExists(wsNode: Hex | null): UseQueryResult<boolean> {
  const publicClient = usePublicClient();

  return useQuery<boolean>({
    queryKey: ["workspaces", "exists", wsNode ?? "none"],
    enabled: wsNode !== null,
    queryFn: async (): Promise<boolean> => {
      if (publicClient === undefined || wsNode === null) return false;
      return await publicClient.readContract({
        address: WORKSPACE_REGISTRY_ADDRESS,
        abi: WorkspaceRegistryAbi,
        functionName: "exists",
        args: [wsNode],
      });
    },
    staleTime: STALE_MS,
    refetchInterval: STALE_MS,
  });
}

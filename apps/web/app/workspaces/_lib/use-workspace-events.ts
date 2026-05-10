"use client";

/**
 * React-Query backed hooks for sourcing workspace data from on-chain
 * event history. We don't have a worker `/api/workspaces` endpoint
 * yet — that ships in Phase 2B — so the browse + detail surfaces
 * read events directly via wagmi's `usePublicClient().getLogs()`.
 *
 * Two read hooks plus two view-fn reads:
 *
 *   useWorkspaceList()                 → all `WorkspaceCreated` events.
 *   useWorkspaceMembers(wsNode)        → `MemberAdded` minus
 *                                        `MemberRemoved` for one ws.
 *   useWorkspaceAdmin(wsNode)          → `adminOf(wsNode)` view.
 *   useWorkspaceExists(wsNode)         → `exists(wsNode)` view.
 *
 * All four poll every 15s by default so a freshly-confirmed tx
 * surfaces within ~1 block. Callers can manually invalidate via the
 * `queryClient` when a write transaction confirms.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { sepoliaDeployment, WorkspaceRegistryAbi } from "@kanbantic/shared";
import type { Address, Hex } from "viem";
import { parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";

import { buildLabelMap } from "./label-cache.js";
import type { WorkspaceMemberSet, WorkspaceRow } from "./types.js";

const WORKSPACE_REGISTRY_ADDRESS = sepoliaDeployment.contracts.WorkspaceRegistry;

/**
 * Lower-bound block for `getLogs`. Sepolia has hundreds of millions
 * of blocks; scanning from genesis is wasteful. The contract was
 * deployed in Phase 1A — pick a generous floor that's a few weeks
 * before the deploy. Adjust if the deploy block changes.
 */
const FROM_BLOCK = 0n;

/** Cached for 15s; refetched on window focus (default). */
const STALE_MS = 15_000;

/**
 * Re-parsed event signatures with `parseAbiItem` so the resulting
 * objects are typed as concrete `AbiEvent` literals. Using
 * `WorkspaceRegistryAbi.find(...)` returns `AbiEvent | undefined`,
 * which viem's `getLogs` rejects (the event type is required to
 * decode the log args).
 */
const WORKSPACE_CREATED_EVENT = parseAbiItem(
  "event WorkspaceCreated(bytes32 indexed wsNode, bytes32 indexed parentNode, address indexed admin)",
);
export function useWorkspaceList(): UseQueryResult<readonly WorkspaceRow[]> {
  const publicClient = usePublicClient();

  return useQuery<readonly WorkspaceRow[]>({
    queryKey: ["workspaces", "list"],
    queryFn: async (): Promise<readonly WorkspaceRow[]> => {
      if (publicClient === undefined) return [];
      const logs = await publicClient.getLogs({
        address: WORKSPACE_REGISTRY_ADDRESS,
        event: WORKSPACE_CREATED_EVENT,
        fromBlock: FROM_BLOCK,
        toBlock: "latest",
      });

      const rows: WorkspaceRow[] = logs.map((log) => {
        const wsNode = log.args.wsNode;
        const admin = log.args.admin;
        if (wsNode === undefined || admin === undefined) {
          throw new Error("WorkspaceCreated log missing indexed args");
        }
        return {
          node: wsNode,
          label: null,
          admin,
          createdAtBlock: log.blockNumber,
          createdTxHash: log.transactionHash,
        };
      });

      const labels = buildLabelMap(rows.map((r) => r.node));
      return rows.map((row) => ({ ...row, label: labels[row.node.toLowerCase()] ?? null }));
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

      const members = (await publicClient.readContract({
        address: WORKSPACE_REGISTRY_ADDRESS,
        abi: WorkspaceRegistryAbi,
        functionName: "membersOf",
        args: [wsNode],
      }));

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

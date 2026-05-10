"use client";

/**
 * `/workspaces/[name]` detail island.
 *
 * Resolves the URL slug to a `wsNode` namehash, then renders the
 * member roster, the bounties scoped to this workspace, and (when
 * the connected wallet is the admin) the admin-only forms for
 * `addMember`, `removeMember`, and `transferAdmin`.
 *
 * The roster is replayed from event history (`MemberAdded` minus
 * `MemberRemoved`); admin is read directly via `adminOf(wsNode)`.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import type { SyntheticEvent } from "react";
import { isAddress, namehash, type Address, type Hex } from "viem";
import { AdminTransferModal } from "./AdminTransferModal.js";
import type { AdminTransferSubmitArgs } from "./AdminTransferModal.js";
import { useAccount, useWaitForTransactionReceipt } from "wagmi";
import { sepoliaDeployment, type BountyListResponse } from "@kanbantic/shared";
import { cn } from "@kanbantic/ui";

import { getWork } from "../../../_lib/api.js";
import { AddressBadge } from "../../../_ui/AddressBadge.js";
import { KanbanBoard } from "../../../_ui/KanbanBoard.js";
import { etherscanAddress, truncateAddress } from "../../../_lib/format.js";
import { useWorkspaceRegistry } from "../../../_lib/contracts.js";
import { lookupWorkspaceLabel } from "../../_lib/label-cache.js";
import {
  useWorkspaceAdmin,
  useWorkspaceExists,
  useWorkspaceMembers,
} from "../../_lib/use-workspace-events.js";

const ROOT_NAME = sepoliaDeployment.ens.rootName;
const ETHERSCAN_TX = "https://sepolia.etherscan.io/tx";

const NAMEHASH_RE = /^0x[0-9a-fA-F]{64}$/;

interface ResolvedSlug {
  wsNode: Hex;
  /** When true, the slug was a label string (we know the human name). */
  hasLabel: boolean;
  label: string | null;
}

function resolveSlug(slug: string): ResolvedSlug | null {
  const decoded = decodeURIComponent(slug);
  if (NAMEHASH_RE.test(decoded)) {
    return {
      wsNode: decoded.toLowerCase() as Hex,
      hasLabel: false,
      label: null,
    };
  }
  if (decoded.length === 0) return null;
  let wsNode: Hex;
  try {
    wsNode = namehash(`${decoded}.${ROOT_NAME}`);
  } catch {
    return null;
  }
  return { wsNode, hasLabel: true, label: decoded };
}

interface WorkspaceDetailClientProps {
  slug: string;
}

export function WorkspaceDetailClient({ slug }: WorkspaceDetailClientProps) {
  const resolved = useMemo(() => resolveSlug(slug), [slug]);

  if (resolved === null) {
    return (
      <section className="flex flex-col gap-3 py-12 text-sm">
        <h1 className="text-3xl font-bold tracking-tight">Workspace not found</h1>
        <p className="text-[var(--color-kanbantic-muted)]">
          The slug <span className="font-mono">{slug}</span> isn&apos;t a valid label or namehash.
        </p>
        <Link href="/workspaces" className="text-[var(--color-kanbantic-accent)] hover:underline">
          ← All workspaces
        </Link>
      </section>
    );
  }

  return <ResolvedWorkspaceDetail resolved={resolved} />;
}

interface ResolvedWorkspaceDetailProps {
  resolved: ResolvedSlug;
}

function ResolvedWorkspaceDetail({ resolved }: ResolvedWorkspaceDetailProps) {
  const { wsNode, hasLabel } = resolved;
  const slugLabel = resolved.label;

  // If the slug was a namehash, peek the local label cache so the
  // header can still show the human name when known.
  const [cachedLabel, setCachedLabel] = useState<string | null>(null);
  useEffect(() => {
    if (hasLabel) return;
    setCachedLabel(lookupWorkspaceLabel(wsNode));
  }, [hasLabel, wsNode]);

  const label = slugLabel ?? cachedLabel;
  const displayName = label !== null ? `${label}.${ROOT_NAME}` : null;

  const { address, isConnected } = useAccount();
  const wallet = address?.toLowerCase() ?? null;

  const exists = useWorkspaceExists(wsNode);
  const adminQuery = useWorkspaceAdmin(wsNode);
  const members = useWorkspaceMembers(wsNode);

  const admin = adminQuery.data ?? null;
  const isAdmin = admin !== null && wallet !== null && wallet === admin.toLowerCase();

  const bountiesQuery = useQuery<BountyListResponse>({
    queryKey: ["bounties", "all", "for-workspace", wsNode],
    queryFn: () => getWork(200),
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
  const bounties = useMemo(() => {
    if (bountiesQuery.data === undefined) return [];
    const target = wsNode.toLowerCase();
    return bountiesQuery.data.bounties.filter(
      (bounty) => bounty.workspace_node.toLowerCase() === target,
    );
  }, [bountiesQuery.data, wsNode]);

  if (exists.isLoading) {
    return (
      <section className="py-12 text-sm text-[var(--color-kanbantic-muted)]">
        Loading workspace…
      </section>
    );
  }

  if (exists.data === false) {
    return (
      <section className="flex flex-col gap-3 py-12 text-sm">
        <h1 className="text-3xl font-bold tracking-tight">Workspace not found</h1>
        <p className="text-[var(--color-kanbantic-muted)]">
          No <span className="font-mono">WorkspaceCreated</span> event for this namehash.
        </p>
        <p className="break-all font-mono text-xs text-[var(--color-kanbantic-muted)]">
          wsNode: {wsNode}
        </p>
        <Link href="/workspaces" className="text-[var(--color-kanbantic-accent)] hover:underline">
          ← All workspaces
        </Link>
      </section>
    );
  }

  return (
    <article className="flex flex-col gap-8 py-8">
      <header className="flex flex-col gap-3 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3 text-sm text-[var(--color-kanbantic-muted)]">
          <Link href="/workspaces" className="hover:text-[var(--color-kanbantic-accent)]">
            ← Workspaces
          </Link>
          <span>/</span>
          <span className="break-all font-mono text-xs">
            {displayName ?? `${wsNode.slice(0, 10)}…`}
          </span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="break-all text-3xl font-bold tracking-tight">
              {displayName ?? "Workspace"}
            </h1>
            <p className="break-all font-mono text-xs text-[var(--color-kanbantic-muted)]">
              {wsNode}
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 text-xs sm:items-end">
            <span className="text-[var(--color-kanbantic-muted)]">Admin</span>
            {admin !== null ? <AddressBadge address={admin} showEtherscan /> : "…"}
            {isAdmin ? (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                You
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
          Members ({members.data?.members.length ?? 0})
        </h2>
        <MemberRoster
          wsNode={wsNode}
          admin={admin}
          isAdmin={isAdmin}
          isConnected={isConnected}
          members={members.data?.members ?? []}
          loading={members.isLoading}
        />
      </section>

      {isConnected && isAdmin ? <AddMemberForm wsNode={wsNode} /> : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
            Kanban ({bounties.length})
          </h2>
          <Link
            href={`/post?workspace=${wsNode}` as never}
            className="rounded-md bg-[var(--color-kanbantic-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90"
          >
            + Create task
          </Link>
        </div>
        {bountiesQuery.isLoading ? (
          <p className="text-sm text-[var(--color-kanbantic-muted)]">Loading tasks…</p>
        ) : bounties.length === 0 ? (
          <p className="rounded-md border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center text-sm text-[var(--color-kanbantic-muted)]">
            No tasks have been posted to this workspace yet.
          </p>
        ) : (
          <KanbanBoard bounties={bounties} />
        )}
      </section>

      {isConnected && isAdmin ? (
        <TransferAdminForm wsNode={wsNode} workspaceLabel={displayName ?? wsNode} />
      ) : null}

      {!isConnected ? (
        <section className="flex flex-col items-start gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm">
          <p className="text-[var(--color-kanbantic-fg)]/85">
            Connect your wallet to manage this workspace (admin-only actions: add / remove members,
            transfer admin).
          </p>
          <ConnectButton />
        </section>
      ) : null}
    </article>
  );
}

interface MemberRosterProps {
  wsNode: Hex;
  admin: Address | null;
  isAdmin: boolean;
  isConnected: boolean;
  members: readonly Address[];
  loading: boolean;
}

function MemberRoster({
  wsNode,
  admin,
  isAdmin,
  isConnected,
  members,
  loading,
}: MemberRosterProps) {
  if (loading) {
    return <p className="text-sm text-[var(--color-kanbantic-muted)]">Loading members…</p>;
  }

  if (members.length === 0) {
    return (
      <p className="text-sm text-[var(--color-kanbantic-muted)]">
        No members yet — admin can add some below.
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-white/5 rounded-lg border border-white/10 bg-white/[0.02]">
      {members.map((member) => {
        const isThisAdmin = admin !== null && member.toLowerCase() === admin.toLowerCase();
        return (
          <li
            key={member}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
          >
            <div className="flex items-center gap-3">
              <a
                href={etherscanAddress(member)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[var(--color-kanbantic-fg)]/90 hover:text-[var(--color-kanbantic-accent)]"
              >
                {truncateAddress(member)}
              </a>
              {isThisAdmin ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-inset ring-amber-500/30">
                  Admin
                </span>
              ) : null}
            </div>
            {isConnected && isAdmin && !isThisAdmin ? (
              <RemoveMemberButton wsNode={wsNode} member={member} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

interface RemoveMemberButtonProps {
  wsNode: Hex;
  member: Address;
}

function RemoveMemberButton({ wsNode, member }: RemoveMemberButtonProps) {
  const queryClient = useQueryClient();
  const { removeMember, isPending, error, hash, reset } = useWorkspaceRegistry();
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt.isSuccess) {
      void queryClient.invalidateQueries({ queryKey: ["workspaces", "members", wsNode] });
    }
  }, [receipt.isSuccess, queryClient, wsNode]);

  function onRemove() {
    if (isPending) return;
    const ok = window.confirm(`Remove ${truncateAddress(member)} from this workspace?`);
    if (!ok) return;
    reset();
    removeMember({ wsNode, member });
  }

  const errorMessage = error?.message ?? receipt.error?.message ?? null;

  return (
    <div className="flex flex-col items-end gap-1 text-xs">
      <button
        type="button"
        onClick={onRemove}
        disabled={isPending || receipt.isLoading}
        className={cn(
          "rounded-md border border-red-500/40 px-2 py-1 text-[11px] font-semibold text-red-300",
          "hover:enabled:bg-red-500/10",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {receipt.isSuccess
          ? "Removed"
          : isPending
            ? "Sign…"
            : receipt.isLoading
              ? "Submitting…"
              : "Remove"}
      </button>
      {errorMessage !== null ? (
        <span role="alert" className="text-red-400">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}

interface AddMemberFormProps {
  wsNode: Hex;
}

function AddMemberForm({ wsNode }: AddMemberFormProps) {
  const queryClient = useQueryClient();
  const inputId = useId();
  const [value, setValue] = useState("");
  const { addMember, isPending, error, hash, reset } = useWorkspaceRegistry();
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt.isSuccess) {
      setValue("");
      void queryClient.invalidateQueries({ queryKey: ["workspaces", "members", wsNode] });
    }
  }, [receipt.isSuccess, queryClient, wsNode]);

  const validation = useMemo<{ value: Address | null; error: string | null }>(() => {
    const trimmed = value.trim();
    if (!trimmed) return { value: null, error: "Member address is required." };
    if (!isAddress(trimmed)) return { value: null, error: "Not a valid Ethereum address." };
    return { value: trimmed, error: null };
  }, [value]);

  function onSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (validation.value === null || isPending) return;
    reset();
    addMember({ wsNode, member: validation.value });
  }

  const errorMessage = error?.message ?? receipt.error?.message ?? null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
        Add member
      </h2>
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4"
      >
        <fieldset
          disabled={isPending || receipt.isLoading}
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
        >
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={inputId} className="text-xs font-medium">
              Member address
            </label>
            <input
              id={inputId}
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
              }}
              placeholder="0x…"
              autoComplete="off"
              spellCheck={false}
              className="rounded-md border border-white/10 bg-transparent px-3 py-2 font-mono text-xs focus:border-[var(--color-kanbantic-accent)] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={
              validation.value === null || isPending || receipt.isLoading || receipt.isSuccess
            }
            className={cn(
              "rounded-md px-4 py-2 text-sm font-semibold transition-opacity",
              "bg-[var(--color-kanbantic-accent)] text-[var(--color-kanbantic-bg)]",
              "disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:opacity-90",
            )}
          >
            {receipt.isSuccess
              ? "Added"
              : isPending
                ? "Sign in wallet…"
                : receipt.isLoading
                  ? "Submitting…"
                  : "Add member"}
          </button>
        </fieldset>

        {validation.error && value ? (
          <p className="text-xs text-red-400">{validation.error}</p>
        ) : null}

        {errorMessage !== null ? (
          <div
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
          >
            {errorMessage}
          </div>
        ) : null}

        {hash !== undefined ? (
          <a
            href={`${ETHERSCAN_TX}/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-mono text-[11px] text-[var(--color-kanbantic-accent)] hover:underline"
          >
            tx: {hash}
          </a>
        ) : null}
      </form>
    </section>
  );
}

interface TransferAdminFormProps {
  wsNode: Hex;
  workspaceLabel: string;
}

function TransferAdminForm({ wsNode, workspaceLabel }: TransferAdminFormProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { transferAdmin, isPending, error, hash, reset } = useWorkspaceRegistry();
  const receipt = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (receipt.isSuccess) {
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["workspaces", "admin", wsNode] });
      void queryClient.invalidateQueries({ queryKey: ["workspaces", "members", wsNode] });
    }
  }, [receipt.isSuccess, queryClient, wsNode]);

  function onSubmit(args: AdminTransferSubmitArgs) {
    reset();
    transferAdmin({ wsNode, newAdmin: args.newAdmin });
  }

  const busy = isPending || receipt.isLoading;
  const errorMessage = error?.message ?? receipt.error?.message ?? null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
        Transfer admin
      </h2>
      <div className="flex flex-col gap-3 rounded-lg border border-red-500/20 bg-red-500/[0.03] p-4">
        <p className="text-xs text-[var(--color-kanbantic-muted)]">
          Transfers control of this workspace to a new admin. The new admin is also added to the
          member set if they aren&apos;t already.
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
          disabled={busy || receipt.isSuccess}
          className={cn(
            "self-start rounded-md border border-red-500/40 px-4 py-2 text-sm font-semibold text-red-300",
            "hover:enabled:bg-red-500/10",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {receipt.isSuccess ? "Transferred" : busy ? "Submitting…" : "Transfer admin…"}
        </button>

        {errorMessage !== null && !open ? (
          <div
            role="alert"
            className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
          >
            {errorMessage}
          </div>
        ) : null}

        {hash !== undefined ? (
          <a
            href={`${ETHERSCAN_TX}/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-mono text-[11px] text-[var(--color-kanbantic-accent)] hover:underline"
          >
            tx: {hash}
          </a>
        ) : null}
      </div>

      {open ? (
        <AdminTransferModal
          workspaceLabel={workspaceLabel}
          busy={busy}
          onSubmit={onSubmit}
          onClose={() => {
            if (!busy) setOpen(false);
          }}
          statusSlot={
            errorMessage !== null ? (
              <div
                role="alert"
                className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
              >
                {errorMessage}
              </div>
            ) : hash !== undefined ? (
              <div className="text-xs text-[var(--color-kanbantic-muted)]">
                Transfer tx submitted — closes automatically on confirmation.
              </div>
            ) : null
          }
        />
      ) : null}
    </section>
  );
}

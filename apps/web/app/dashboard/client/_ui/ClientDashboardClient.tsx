"use client";

/**
 * Wallet-scoped client dashboard island.
 *
 * Filters bounties by `poster === wallet.address` and renders one row
 * per posted bounty with status pill, claimer info, and a deep link
 * to `/work/[id]` for the lifecycle view.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import type { Route } from "next";
import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { BountySummary } from "@kanbantic/shared";
import { useAccount } from "wagmi";

import { truncateAddress } from "../../../_lib/format.js";
import { formatEth, relativeTime } from "../../../work/_lib/format.js";
import { StatusPill } from "../../../work/_ui/StatusPill.js";
import { DashboardLayout } from "../../_ui/DashboardLayout.js";
import { EmptyState } from "../../_ui/EmptyState.js";
import { filterByPoster } from "../../_lib/filters.js";

const STATUS_FILTERS = [
  { value: null, label: "All" },
  { value: "Open", label: "Open" },
  { value: "Claimed", label: "Claimed" },
  { value: "Submitted", label: "Submitted" },
  { value: "Resolved", label: "Resolved" },
  { value: "Disputed", label: "Disputed" },
  { value: "Refunded", label: "Refunded" },
] as const;

const ACTIVE_CLAIMER_STATUSES = new Set(["Claimed", "Submitted", "Resolved"]);

interface ClientDashboardClientProps {
  bounties: readonly BountySummary[];
}

export function ClientDashboardClient({ bounties }: ClientDashboardClientProps) {
  const { address, isConnected } = useAccount();
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const activeStatus = params.get("status");

  const posted = useMemo<BountySummary[]>(() => {
    if (!address) return [];
    return filterByPoster(bounties, address);
  }, [bounties, address]);

  const filtered = useMemo<BountySummary[]>(() => {
    if (activeStatus === null) return posted;
    return posted.filter((bounty) => bounty.status === activeStatus);
  }, [posted, activeStatus]);

  function setFilter(value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null) {
      next.delete("status");
    } else {
      next.set("status", value);
    }
    const qs = next.toString();
    const target = qs.length > 0 ? `${pathname}?${qs}` : pathname;
    router.replace(target as Route, { scroll: false });
  }

  return (
    <DashboardLayout
      title="Client dashboard"
      description="Bounties this wallet has posted to the Kanbantic BountyBoard. Filter by status to find one in flight, or click through for the full lifecycle view."
      walletConnected={isConnected}
      connectSlot={<ConnectButton />}
    >
      {posted.length === 0 ? (
        <EmptyState
          headline="No bounties posted from this wallet."
          body={
            <>
              Post your first bounty to escrow ETH against a capability filter — agents matching the
              filter can claim, submit work, and settle on-chain.
            </>
          }
          cta={
            <Link
              href="/post"
              className="inline-flex rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90"
            >
              Post a bounty →
            </Link>
          }
        />
      ) : (
        <>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filter posted bounties by status"
          >
            {STATUS_FILTERS.map((filter) => {
              const isActive =
                filter.value === activeStatus || (filter.value === null && activeStatus === null);
              return (
                <button
                  key={filter.label}
                  type="button"
                  onClick={() => {
                    setFilter(filter.value);
                  }}
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? "rounded-full border border-[var(--color-kanbantic-accent)] bg-[var(--color-kanbantic-accent)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-kanbantic-accent)]"
                      : "rounded-full border border-white/15 px-3 py-1 text-xs text-[var(--color-kanbantic-fg)]/80 transition-colors hover:border-[var(--color-kanbantic-accent)]/60 hover:text-[var(--color-kanbantic-accent)]"
                  }
                >
                  {filter.label}
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              headline={`No posted bounties match "${activeStatus ?? "All"}".`}
              body="Try another filter chip — your full posted history is one click away."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {filtered.map((bounty) => (
                <li key={bounty.id}>
                  <PostedBountyRow bounty={bounty} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </DashboardLayout>
  );
}

interface PostedBountyRowProps {
  bounty: BountySummary;
}

function PostedBountyRow({ bounty }: PostedBountyRowProps) {
  const showClaimer = ACTIVE_CLAIMER_STATUSES.has(bounty.status) && bounty.claimer_address !== null;
  const claimerLabel =
    bounty.claimer_node !== null && bounty.claimer_node.length > 0
      ? bounty.claimer_node.replace(/\.kanbantic\.eth$/i, "")
      : null;

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-[var(--color-kanbantic-muted)]">
          <span>#{bounty.id}</span>
          <span>·</span>
          <span>posted {relativeTime(bounty.created_at_ts)}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold text-[var(--color-kanbantic-fg)]">
            {bounty.capability}
          </span>
          <StatusPill status={bounty.status} />
        </div>
        {showClaimer && bounty.claimer_address ? (
          <div className="flex items-center gap-2 text-xs text-[var(--color-kanbantic-muted)]">
            <span>claimed by</span>
            {claimerLabel ? (
              <Link
                href={`/agents/${claimerLabel}` as Route}
                className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[var(--color-kanbantic-fg)]/90 hover:text-[var(--color-kanbantic-accent)]"
              >
                {bounty.claimer_node}
              </Link>
            ) : (
              <span className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[var(--color-kanbantic-fg)]/90">
                {truncateAddress(bounty.claimer_address)}
              </span>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-4">
        <span className="font-mono text-base font-bold tabular-nums text-[var(--color-kanbantic-fg)]">
          {formatEth(bounty.reward)}
        </span>
        <Link
          href={`/work/${bounty.id}` as Route}
          className="text-sm font-semibold text-[var(--color-kanbantic-accent)] hover:underline"
        >
          View →
        </Link>
      </div>
    </article>
  );
}

"use client";

/**
 * Arbiter dashboard island.
 *
 * Until per-workspace councils ship (Phase 7), surfaces every
 * Disputed bounty whose `arbiter_council` matches
 * `sepoliaDeployment.contracts.ArbiterCouncil`. Anyone can view this
 * dashboard — actual vote-cast is gated by the contract.
 *
 * Vote tally + cast-vote UI live on `/work/[id]` (Web 4 territory);
 * we link out to that page from each row.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import type { Route } from "next";
import { useMemo } from "react";
import type { BountySummary } from "@kanbantic/shared";
import { sepoliaDeployment } from "@kanbantic/shared";
import { useAccount } from "wagmi";

import { formatEth, relativeTime } from "../../../work/_lib/format.js";
import { StatusPill } from "../../../work/_ui/StatusPill.js";
import { DashboardLayout } from "../../_ui/DashboardLayout.js";
import { EmptyState } from "../../_ui/EmptyState.js";
import { filterDisputesForCouncil } from "../../_lib/filters.js";

interface ArbiterDashboardClientProps {
  bounties: readonly BountySummary[];
}

export function ArbiterDashboardClient({ bounties }: ArbiterDashboardClientProps) {
  const { isConnected } = useAccount();

  const disputes = useMemo<BountySummary[]>(
    () => filterDisputesForCouncil(bounties, sepoliaDeployment.contracts.ArbiterCouncil),
    [bounties],
  );

  return (
    <DashboardLayout
      title="Arbiter dashboard"
      description={
        <>
          Disputed bounties currently routed to the Phase 1B{" "}
          <span className="font-mono">ArbiterCouncil</span> (
          {sepoliaDeployment.contracts.ArbiterCouncil}). Transparency view — anyone can read; the
          on-chain <span className="font-mono">vote()</span> is gated to council members.
        </>
      }
      walletConnected={isConnected}
      connectSlot={<ConnectButton />}
    >
      {disputes.length === 0 ? (
        <EmptyState
          headline="No active disputes."
          body="Every bounty is either in flight or settled. Check back when a poster rejects a submission."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {disputes.map((bounty) => (
            <li key={bounty.id}>
              <DisputedBountyRow bounty={bounty} />
            </li>
          ))}
        </ul>
      )}
    </DashboardLayout>
  );
}

interface DisputedBountyRowProps {
  bounty: BountySummary;
}

function DisputedBountyRow({ bounty }: DisputedBountyRowProps) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-rose-500/30 bg-rose-500/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
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
      </div>

      <div className="flex items-center gap-4">
        <span className="font-mono text-base font-bold tabular-nums text-[var(--color-kanbantic-fg)]">
          {formatEth(bounty.reward)}
        </span>
        <Link
          href={`/work/${bounty.id}` as Route}
          className="text-sm font-semibold text-[var(--color-kanbantic-accent)] hover:underline"
        >
          View votes →
        </Link>
      </div>
    </article>
  );
}

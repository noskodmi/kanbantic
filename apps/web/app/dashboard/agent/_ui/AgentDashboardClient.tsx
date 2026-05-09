"use client";

/**
 * Wallet-scoped agent dashboard island.
 *
 * Reads the connected wallet via wagmi, filters the indexer-supplied
 * agent list to the ones this address owns, and decorates each row
 * with bounty-derived stats (claimed count, settled revenue). When
 * the agent's settled revenue clears the Umia threshold, surfaces
 * the "Spin out as Umia venture" CTA from spec §6.
 */

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import type { AgentSummary, BountySummary } from "@kanbantic/shared";
import { useAccount } from "wagmi";

import { ReputationStars } from "../../../_ui/ReputationStars.js";
import { parseCapabilities } from "../../../_lib/format.js";
import { formatEth } from "../../../work/_lib/format.js";
import { DashboardLayout } from "../../_ui/DashboardLayout.js";
import { EmptyState } from "../../_ui/EmptyState.js";
import { filterByClaimer, filterByOwner, sumSettledRewardsForAgent } from "../../_lib/filters.js";
import { UMIA_THRESHOLD_WEI, buildUmiaCliManifest } from "../../_lib/umia.js";

interface AgentDashboardClientProps {
  agents: readonly AgentSummary[];
  bounties: readonly BountySummary[];
}

export function AgentDashboardClient({ agents, bounties }: AgentDashboardClientProps) {
  const { address, isConnected } = useAccount();

  const owned = useMemo<AgentSummary[]>(() => {
    if (!address) return [];
    return filterByOwner(agents, address);
  }, [agents, address]);

  return (
    <DashboardLayout
      title="Agent dashboard"
      description={
        <>
          Every agent you own across <span className="font-mono">kanbantic.eth</span>. Reputation,
          claimed bounties, and settled revenue stream live from the indexer; the Umia spin-out CTA
          arms when revenue clears 0.005 ETH.
        </>
      }
      walletConnected={isConnected}
      connectSlot={<ConnectButton />}
    >
      {owned.length === 0 ? (
        <EmptyState
          headline="You haven't registered any agents yet."
          body={
            <>
              Register an agent under <span className="font-mono">kanbantic.eth</span> to claim
              bounties, accrue reputation, and unlock the Umia spin-out flow.
            </>
          }
          cta={
            <Link
              href="/register"
              className="inline-flex rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90"
            >
              Register an agent →
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {owned.map((agent) => (
            <li key={agent.node}>
              <OwnedAgentRow agent={agent} bounties={bounties} />
            </li>
          ))}
        </ul>
      )}
    </DashboardLayout>
  );
}

interface OwnedAgentRowProps {
  agent: AgentSummary;
  bounties: readonly BountySummary[];
}

function OwnedAgentRow({ agent, bounties }: OwnedAgentRowProps) {
  const claimed = useMemo(() => filterByClaimer(bounties, agent.node), [bounties, agent.node]);
  const settledWei = useMemo(
    () => sumSettledRewardsForAgent(bounties, agent.node),
    [bounties, agent.node],
  );
  const settledLabel = settledWei === 0n ? "0 ETH" : formatEth(settledWei.toString());
  const tags = parseCapabilities(agent.capabilities);
  const ensName = `${agent.label}.kanbantic.eth`;
  const umiaArmed = settledWei >= UMIA_THRESHOLD_WEI;

  return (
    <article className="flex flex-col gap-4 rounded-lg border border-white/10 bg-white/[0.02] p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <Link
            href={`/agents/${agent.label}` as Route}
            className="text-lg font-semibold tracking-tight text-[var(--color-kanbantic-fg)] hover:text-[var(--color-kanbantic-accent)]"
          >
            {ensName}
          </Link>
          {tags.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] tracking-wide text-[var(--color-kanbantic-fg)]/80"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs italic text-[var(--color-kanbantic-muted)]">
              no capabilities listed
            </p>
          )}
        </div>
        <ReputationStars score={agent.reputation_score} count={agent.reputation_count} />
      </div>

      <dl className="grid grid-cols-2 gap-3 border-t border-white/10 pt-3 text-xs sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="text-[var(--color-kanbantic-muted)]">Bounties claimed</dt>
          <dd className="font-mono text-base text-[var(--color-kanbantic-fg)]">{claimed.length}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[var(--color-kanbantic-muted)]">Settled revenue</dt>
          <dd className="font-mono text-base text-[var(--color-kanbantic-fg)]">{settledLabel}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[var(--color-kanbantic-muted)]">Umia threshold</dt>
          <dd
            className={
              umiaArmed
                ? "font-mono text-base text-emerald-300"
                : "font-mono text-base text-[var(--color-kanbantic-muted)]"
            }
          >
            {umiaArmed ? "Reached" : "0.005 ETH"}
          </dd>
        </div>
      </dl>

      <UmiaSpinOutCta agent={agent} bountiesClaimedCount={claimed.length} armed={umiaArmed} />
    </article>
  );
}

interface UmiaSpinOutCtaProps {
  agent: AgentSummary;
  bountiesClaimedCount: number;
  armed: boolean;
}

function UmiaSpinOutCta({ agent, bountiesClaimedCount, armed }: UmiaSpinOutCtaProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const manifest = useMemo(
    () => buildUmiaCliManifest({ agent, bountiesClaimed: bountiesClaimedCount }),
    [agent, bountiesClaimedCount],
  );

  if (!armed) {
    return (
      <p className="text-xs text-[var(--color-kanbantic-muted)]">
        Once settled revenue reaches 0.005 ETH, you can spin this agent out as a Umia venture.
      </p>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(manifest);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      // Clipboard blocked (insecure context, etc.) — surface nothing; user
      // can still copy from the visible textarea.
    }
  }

  return (
    <div className="flex flex-col gap-3 border-t border-white/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-emerald-300">
          Settled revenue clears the Umia threshold — this agent is eligible to spin out.
        </p>
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
          }}
          className="rounded-md border border-[var(--color-kanbantic-accent)]/40 bg-[var(--color-kanbantic-accent)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--color-kanbantic-accent)] hover:bg-[var(--color-kanbantic-accent)]/20"
        >
          {open ? "Hide manifest" : "Spin out as Umia venture"}
        </button>
      </div>

      {open ? (
        <div className="flex flex-col gap-2 rounded-md border border-white/10 bg-black/30 p-3">
          <p className="text-[11px] text-[var(--color-kanbantic-muted)]">
            Phase 3 prints the deterministic Umia CLI manifest derived from this agent&apos;s
            on-chain data. The <span className="font-mono">AgentVenture</span> ERC-721 mint + Swarm
            tokenURI ship in Phase 7 — the placeholders below are populated automatically once that
            lands.
          </p>
          <pre className="max-h-72 overflow-auto rounded bg-black/50 p-3 font-mono text-[11px] text-[var(--color-kanbantic-fg)]/90">
            {manifest}
          </pre>
          <button
            type="button"
            onClick={() => {
              void copy();
            }}
            className="self-start rounded-md border border-white/10 px-3 py-1 text-xs text-[var(--color-kanbantic-fg)]/80 hover:border-[var(--color-kanbantic-accent)] hover:text-[var(--color-kanbantic-accent)]"
          >
            {copied ? "Copied!" : "Copy CLI command"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

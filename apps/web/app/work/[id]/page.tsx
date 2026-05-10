/**
 * `/work/[id]` — bounty detail (read-side).
 *
 * Server component. Phase 2B's `/api/work/[id]` returns the full
 * bounty + status timeline (from `bounty_history`) + joined claimer
 * agent + on-bounty attestations in one round-trip.
 *
 * Wallet-gated write CTAs (claim / commit-claim / submit / accept /
 * reject + the EIP-712-free attestation flow) live in the
 * `WorkActions` client island — see `_ui/WorkActions.tsx`. The
 * verified-fetch description viewer lands in a later batch.
 */

import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";

import { sepoliaDeployment } from "@kanbantic/shared";

import { getWorkDetail } from "../../_lib/api.js";
import { etherscanAddress, truncateAddress } from "../../_lib/format.js";
import { StatusPill } from "../_ui/StatusPill.js";
import { formatEth, relativeTime } from "../_lib/format.js";
import { WorkActions } from "./_ui/WorkActions.js";

const STATUSES_AFTER_CLAIMED = new Set([
  "Claimed",
  "Submitted",
  "Resolved",
  "Disputed",
  "Refunded",
]);

const STATUSES_AFTER_SUBMITTED = new Set(["Submitted", "Resolved", "Disputed", "Refunded"]);

interface WorkDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function WorkDetailPage({ params }: WorkDetailPageProps) {
  const { id } = await params;

  const detail = await getWorkDetail(id);
  if (!detail) {
    notFound();
  }
  const bounty = detail.bounty;

  const showClaimer = STATUSES_AFTER_CLAIMED.has(bounty.status) && bounty.claimer_address !== null;
  const showProof = STATUSES_AFTER_SUBMITTED.has(bounty.status);
  const bountyBoardEtherscan = etherscanAddress(sepoliaDeployment.contracts.BountyBoard);
  // Genesis row of the timeline always exists for an indexed bounty
  // (`BountyPosted` → "Open"), so we render the full server-side
  // history when present and fall back to the synthesized two-row
  // view (Posted + current) only if no history was indexed yet.
  const historyEntries = detail.history;

  return (
    <article className="flex flex-col gap-8 py-8">
      <header className="flex flex-col gap-3 border-b border-white/10 pb-6">
        <div className="flex items-center gap-3 text-sm text-[var(--color-kanbantic-muted)]">
          <Link href="/work" className="hover:text-[var(--color-kanbantic-accent)]">
            ← Work
          </Link>
          <span>/</span>
          <span>#{bounty.id}</span>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold tracking-tight">{bounty.capability}</h1>
            <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-kanbantic-muted)]">
              <span>posted {relativeTime(bounty.created_at_ts)}</span>
              <span aria-hidden="true">·</span>
              <span>by</span>
              <a
                href={etherscanAddress(bounty.poster)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[var(--color-kanbantic-fg)]/90 hover:text-[var(--color-kanbantic-accent)]"
              >
                {truncateAddress(bounty.poster)}
              </a>
            </div>
          </div>

          <div className="flex flex-col items-start gap-2 sm:items-end">
            <span className="text-2xl font-bold tabular-nums">{formatEth(bounty.reward)}</span>
            <StatusPill status={bounty.status} />
          </div>
        </div>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
          Description
        </h2>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm">
          <p className="text-[var(--color-kanbantic-fg)]/85">
            Description fetched from Swarm — verified-fetch viewer lands when{" "}
            <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-xs">
              @kanbantic/swarm-verified-fetch
            </code>{" "}
            is published.
          </p>
          <p className="mt-2 break-all font-mono text-xs text-[var(--color-kanbantic-muted)]">
            ref: {bounty.description_ref}
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
          Status timeline
        </h2>
        <ol className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm">
          {historyEntries.length > 0 ? (
            historyEntries.map((entry, idx) => (
              <li
                key={`${String(entry.block_number)}-${entry.tx_hash}-${String(idx)}`}
                className="flex items-baseline gap-3"
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 translate-y-1 rounded-full bg-emerald-400"
                  aria-hidden="true"
                />
                <div className="flex flex-col">
                  <span className="font-semibold">
                    {entry.status_from === null
                      ? `Posted (${entry.status_to})`
                      : `${entry.status_from} → ${entry.status_to}`}
                  </span>
                  <span className="text-xs text-[var(--color-kanbantic-muted)]">
                    block {String(entry.block_number)} · {relativeTime(entry.ts)}
                  </span>
                </div>
              </li>
            ))
          ) : (
            <>
              <li className="flex items-baseline gap-3">
                <span
                  className="inline-block h-2 w-2 shrink-0 translate-y-1 rounded-full bg-emerald-400"
                  aria-hidden="true"
                />
                <div className="flex flex-col">
                  <span className="font-semibold">Posted</span>
                  <span className="text-xs text-[var(--color-kanbantic-muted)]">
                    block {String(bounty.created_at_block)} · {relativeTime(bounty.created_at_ts)}
                  </span>
                </div>
              </li>
              <li className="flex items-baseline gap-3">
                <span
                  className="inline-block h-2 w-2 shrink-0 translate-y-1 rounded-full bg-sky-400"
                  aria-hidden="true"
                />
                <div className="flex flex-col">
                  <span className="font-semibold">Current state · {bounty.status}</span>
                  <span className="text-xs text-[var(--color-kanbantic-muted)]">
                    {bounty.resolved_at_block === null
                      ? "in progress on-chain"
                      : `resolved at block ${String(bounty.resolved_at_block)}`}
                  </span>
                </div>
              </li>
            </>
          )}
        </ol>
      </section>

      {showClaimer && bounty.claimer_address !== null ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
            Claimer
          </h2>
          <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-4">
            {detail.claimer_agent !== null ? (
              <Link
                href={`/agents/${detail.claimer_agent.label}` as Route}
                className="font-semibold text-[var(--color-kanbantic-accent)] hover:underline"
              >
                {detail.claimer_agent.label}.kanbantic.eth
              </Link>
            ) : bounty.claimer_node !== null && bounty.claimer_node.length > 0 ? (
              <Link
                href={`/agents/${bounty.claimer_node}` as Route}
                className="font-semibold text-[var(--color-kanbantic-accent)] hover:underline"
              >
                {bounty.claimer_node}
              </Link>
            ) : null}
            <a
              href={etherscanAddress(bounty.claimer_address)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-[var(--color-kanbantic-muted)] hover:text-[var(--color-kanbantic-accent)]"
            >
              {truncateAddress(bounty.claimer_address)}
            </a>
          </div>
        </section>
      ) : null}

      {showProof ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
            Proof of work
          </h2>
          <div
            className="flex flex-col gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-4 text-sm"
            data-testid="proof-viewer"
          >
            <p className="text-[var(--color-kanbantic-fg)]/85">
              Submission hash recorded on-chain. The verified-fetch viewer ships with{" "}
              <code className="rounded bg-white/5 px-1 py-0.5 font-mono text-xs">
                @kanbantic/swarm-verified-fetch
              </code>
              .
            </p>
            <p className="break-all font-mono text-xs text-[var(--color-kanbantic-muted)]">
              ref: pending — exposed by /api/work/[id] in Phase 2B
            </p>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-kanbantic-muted)]">
          Actions
        </h2>
        <WorkActions bounty={bounty} />
      </section>

      <footer className="flex flex-wrap gap-4 border-t border-white/10 pt-4 text-xs text-[var(--color-kanbantic-muted)]">
        <a
          href={bountyBoardEtherscan}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--color-kanbantic-accent)]"
        >
          BountyBoard on Etherscan ↗
        </a>
        <a
          href={etherscanAddress(bounty.poster)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-[var(--color-kanbantic-accent)]"
        >
          Poster on Etherscan ↗
        </a>
      </footer>
    </article>
  );
}

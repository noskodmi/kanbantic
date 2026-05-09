/**
 * `/dashboard/contract-intelligence` — Sourcify-routed audits.
 *
 * Pure server component — no wallet scoping. Lists every bounty
 * whose capability is `audit | explain | similarity` (per spec §6
 * Sourcify subsection). Phase 7 wires real Contract Intelligence
 * task templates into `BountyBoard.taskKind`; until then the
 * capability filter is a string match.
 *
 * Each row deep-links to the Sourcify lookup page and the Swarm
 * artifact (when settled). Phase 3 doesn't parse the target address
 * out of the description; we surface the description hash as the
 * placeholder "target" until the on-chain task template carries the
 * address explicitly.
 */

import Link from "next/link";
import type { Route } from "next";
import type { BountySummary } from "@kanbantic/shared";

import { getWork } from "../../_lib/api.js";
import { formatEth, relativeTime } from "../../work/_lib/format.js";
import { StatusPill } from "../../work/_ui/StatusPill.js";
import { EmptyState } from "../_ui/EmptyState.js";
import { filterContractIntelligence } from "../_lib/filters.js";

export const dynamic = "force-dynamic";

const SOURCIFY_LOOKUP = "https://sourcify.dev/lookup";

export default async function ContractIntelligenceDashboardPage() {
  let bounties: BountySummary[] = [];
  try {
    const result = await getWork();
    bounties = result.bounties;
  } catch {
    // Indexer offline — fall through with empty list.
  }
  const audits = filterContractIntelligence(bounties);

  return (
    <section className="flex flex-col gap-6 py-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Contract Intelligence</h1>
        <p className="max-w-2xl text-sm text-[var(--color-kanbantic-muted)]">
          Kanbantic&apos;s Contract Intelligence category routes audit, explain, and similarity
          bounties through Sourcify-verified source. Each row links to the Sourcify match page and
          the Swarm artifact so the proof trail is independently verifiable.
        </p>
      </header>

      {audits.length === 0 ? (
        <EmptyState
          headline="No Contract Intelligence audits yet."
          body={
            <>
              Be the first to post one with capability = <span className="font-mono">audit</span>,{" "}
              <span className="font-mono">explain</span>, or{" "}
              <span className="font-mono">similarity</span>.
            </>
          }
          cta={
            <Link
              href="/post"
              className="inline-flex rounded-md bg-[var(--color-kanbantic-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-kanbantic-bg)] transition-opacity hover:opacity-90"
            >
              Post an audit bounty →
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {audits.map((bounty) => {
            const targetRef = bounty.description_ref;
            const sourcifyHref = `${SOURCIFY_LOOKUP}/${targetRef}`;
            const swarmHref =
              bounty.status === "Resolved" && bounty.resolved_at_block !== null
                ? `https://api.gateway.ethswarm.org/bzz/${targetRef}`
                : null;

            return (
              <li key={bounty.id}>
                <article className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
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
                    <span className="font-mono text-base font-bold tabular-nums text-[var(--color-kanbantic-fg)]">
                      {formatEth(bounty.reward)}
                    </span>
                  </div>

                  <dl className="grid gap-2 border-t border-white/10 pt-3 text-xs sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <dt className="text-[var(--color-kanbantic-muted)]">Target ref</dt>
                      <dd className="break-all font-mono text-[var(--color-kanbantic-fg)]/80">
                        {targetRef}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-1">
                      <dt className="text-[var(--color-kanbantic-muted)]">Links</dt>
                      <dd className="flex flex-wrap items-center gap-3">
                        <a
                          href={sourcifyHref}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[var(--color-kanbantic-accent)] hover:underline"
                        >
                          Sourcify lookup ↗
                        </a>
                        {swarmHref ? (
                          <a
                            href={swarmHref}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-[var(--color-kanbantic-accent)] hover:underline"
                          >
                            Swarm artifact ↗
                          </a>
                        ) : (
                          <span className="text-[var(--color-kanbantic-muted)]">
                            Swarm artifact pending settlement
                          </span>
                        )}
                        <Link
                          href={`/work/${bounty.id}` as Route}
                          className="text-[var(--color-kanbantic-accent)] hover:underline"
                        >
                          Bounty detail →
                        </Link>
                      </dd>
                    </div>
                  </dl>
                </article>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="rounded-md border border-white/10 bg-white/[0.02] px-4 py-3 text-xs text-[var(--color-kanbantic-muted)]">
        Why Contract Intelligence: Sourcify is load-bearing, not a checkbox. Posters value
        Sourcify&apos;s exact-match guarantees because audit findings need stable line citations
        into bytecode-matching source. Kanbantic routes on-chain economic flow (bounty payouts)
        through verified-source lookups. See spec §6 Sourcify section.
      </footer>
    </section>
  );
}
